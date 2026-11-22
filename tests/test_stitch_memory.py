"""Run the real stitch function with deterministic, offline audio/storage doubles."""
import ast
import gc
import io
import math
import pathlib
import unittest
import weakref
from unittest.mock import Mock


class Segment:
    decoded = weakref.WeakSet()

    def __init__(self, names, decoded=False):
        self.names = tuple(names)
        if decoded:
            self.decoded.add(self)

    def fade_in(self, _):
        return self

    def fade_out(self, _):
        return self

    def append(self, other, crossfade):
        assert crossfade == 1500
        return Segment(self.names + other.names)

    @property
    def dBFS(self):
        return -10

    def apply_gain(self, change):
        assert change == -4
        return self

    def export(self, output, format, bitrate):
        assert format == 'mp3'
        output.write(','.join(self.names).encode())

    def __len__(self):
        return len(self.names) * 10_000


class StitchMemoryTests(unittest.TestCase):
    def setUp(self):
        source = pathlib.Path(__file__).parents[1] / 'workers' / 'stitch_worker.py'
        parsed = ast.parse(source.read_text(encoding='utf8'))
        stitch = next(node for node in parsed.body if isinstance(node, ast.FunctionDef) and node.name == '_stitch')
        self.patches, self.downloads = [], []
        self.scope = dict(gc=gc, io=io, math=math, traceback=Mock(),
                          FADE_IN_MS=1000, FADE_OUT_MS=2000, CROSSFADE_MS=1500,
                          MASTER_MP3_BITRATE='96k', BUCKET='fixture', _now=lambda: 'now',
                          _heartbeat=Mock(), _bitrate_kbps=lambda _: 96,
                          _patch_render=lambda _, body: self.patches.append(body),
                          _patch=Mock(), _upload_master=Mock(return_value='https://fixture.invalid/master.mp3'))

        def download(url):
            # One decoded first track may still be the current master; later
            # decoded inputs must be released before the next download.
            self.assertLessEqual(len(Segment.decoded), 1)
            self.downloads.append(url)
            return Segment([url], decoded=True)

        self.scope['_download'] = download
        exec(compile(ast.Module(body=[stitch], type_ignores=[]), str(source), 'exec'), self.scope)

    def run_stitch(self, tracks):
        self.scope['_stitch']('render', 'session', tracks)

    def test_long_album_releases_decoded_inputs_and_preserves_order(self):
        tracks = [{'track_number': n, 'audio_url': str(n)} for n in reversed(range(39))]
        tracks.append({'track_number': -1, 'audio_url': None})
        self.run_stitch(tracks)
        self.assertEqual(self.downloads, [str(n) for n in range(39)])
        self.assertEqual(self.patches[-1]['status'], 'ready')
        self.assertEqual(self.patches[-1]['duration_seconds'], 390)
        self.assertEqual(self.scope['_upload_master'].call_args.args[1], ','.join(self.downloads).encode())
        gc.collect()
        self.assertEqual(len(Segment.decoded), 0)

    def test_single_track_finishes(self):
        self.run_stitch([{'track_number': 1, 'audio_url': 'one'}])
        self.assertEqual(self.patches[-1]['status'], 'ready')
        self.assertEqual(self.patches[-1]['duration_seconds'], 10)

    def test_no_playable_tracks_fails_without_upload(self):
        self.run_stitch([{'track_number': 1}])
        self.assertEqual(self.patches[-1]['status'], 'failed')
        self.assertIn('No playable', self.patches[-1]['error_message'])
        self.scope['_upload_master'].assert_not_called()

    def test_download_failure_is_recorded_without_upload(self):
        self.scope['_download'] = Mock(side_effect=RuntimeError('download outage'))
        self.run_stitch([{'audio_url': 'one'}])
        self.assertEqual(self.patches[-1]['status'], 'failed')
        self.assertEqual(self.patches[-1]['error_message'], 'download outage')
        self.scope['_upload_master'].assert_not_called()


if __name__ == '__main__':
    unittest.main()

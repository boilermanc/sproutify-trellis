"""Exercise installed stitch code and codecs with in-memory audio and no network."""
import ast
import contextlib
import gc
import hashlib
import io
import json
import math
import pathlib
import traceback

from pydub import AudioSegment
from pydub.generators import Sine

path = pathlib.Path('/opt/trellis/workers/stitch_worker.py')
source = path.read_bytes()
expected = '9c89372e4f7b017d994b92d3e947c69001a716a1aa387ad80b0cc4a6dfcf7c32'
assert hashlib.sha256(source).hexdigest() == expected, 'Installed worker differs from reviewed release'
tree = ast.parse(source)
functions = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in ('_stitch', '_bitrate_kbps')]
assert len(functions) == 2
patches, uploaded = [], []


def upload(_path, data):
    uploaded.append(data)
    return 'https://offline.invalid/smoke.mp3'


scope = dict(gc=gc, io=io, math=math, traceback=traceback,
             CROSSFADE_MS=1500, FADE_IN_MS=1000, FADE_OUT_MS=2000,
             MASTER_MP3_BITRATE='96k', BUCKET='offline-fixture',
             _now=lambda: 'offline-smoke', _heartbeat=lambda *_: None,
             _patch_render=lambda _, body: patches.append(body),
             _patch=lambda *_: None, _upload_master=upload,
             _download=lambda frequency: Sine(int(frequency)).to_audio_segment(duration=4000, volume=-20))
exec(compile(ast.Module(body=functions, type_ignores=[]), str(path), 'exec'), scope)
with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
    scope['_stitch']('offline-smoke', 'offline-smoke', [
        {'track_number': n, 'audio_url': str(frequency)}
        for n, frequency in enumerate((440, 550, 660), start=1)
    ])
assert patches[-1]['status'] == 'ready', 'Installed stitching function failed'
assert patches[-1]['duration_seconds'] == 9
assert len(uploaded) == 1 and len(uploaded[0]) > 50_000
decoded = AudioSegment.from_file(io.BytesIO(uploaded[0]), format='mp3')
assert abs(len(decoded) - 9000) < 100, 'Exported MP3 duration is incorrect'
print(json.dumps({'offline_codec_smoke': 'PASS', 'installed_sha256': expected,
                  'input_tracks': 3, 'duration_seconds': 9, 'mp3_bytes': len(uploaded[0]),
                  'network_calls': 0, 'production_storage_writes': 0}))

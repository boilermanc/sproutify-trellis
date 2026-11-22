"""Read-only server discovery. Never read environment files or print credentials."""
import ast
import hashlib
import json
import os
import pathlib
import shutil
import subprocess
import sys
import urllib.request


def command(args):
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=10)
        return result.returncode, result.stdout.strip()
    except (OSError, subprocess.TimeoutExpired):
        return -1, ""


report = {"python": sys.version.split()[0], "uid": os.getuid()}
_, unit = command(["systemctl", "show", "trellis-stitch.service", "--no-pager",
                   "--property=LoadState,ActiveState,SubState,FragmentPath,WorkingDirectory,MainPID,User"])
report["unit"] = dict(line.split("=", 1) for line in unit.splitlines() if "=" in line)
_, units = command(["systemctl", "list-unit-files", "--no-legend", "--no-pager", "*stitch*", "trellis*", "n8n*"])
report["related_units"] = units.splitlines()
report["can_sudo_noninteractive"] = command(["sudo", "-n", "true"])[0] == 0
report["ffmpeg_present"] = shutil.which("ffmpeg") is not None
processes = []
for entry in pathlib.Path("/proc").iterdir():
    if not entry.name.isdigit():
        continue
    try:
        args = (entry / "cmdline").read_bytes().split(b"\0")
        scripts = [os.fsdecode(arg) for arg in args if pathlib.Path(os.fsdecode(arg)).name == "stitch_worker.py"]
        if scripts:
            processes.append({"pid": int(entry.name), "cwd": os.readlink(entry / "cwd"),
                              "executable": os.readlink(entry / "exe"), "scripts": scripts})
    except (OSError, ValueError):
        continue
report["stitch_processes"] = processes
paths = set()
directory = report["unit"].get("WorkingDirectory")
if directory:
    paths.add(str(pathlib.Path(directory) / "stitch_worker.py"))
for process in processes:
    for script in process["scripts"]:
        paths.add(str(pathlib.Path(process["cwd"]) / script))
files = []
for name in sorted(paths):
    path = pathlib.Path(name)
    try:
        data = path.read_bytes()
        tree = ast.parse(data)
        stitch = next((n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "_stitch"), None)
        files.append({"path": str(path.resolve()), "sha256": hashlib.sha256(data).hexdigest(),
                      "writable": os.access(path, os.W_OK),
                      "has_incremental_release": bool(stitch and any(isinstance(n, ast.Delete) for n in ast.walk(stitch))),
                      "has_gc_collection": b"gc.collect()" in data})
    except (OSError, SyntaxError):
        files.append({"path": name, "readable_python": False})
report["worker_files"] = files
try:
    with urllib.request.urlopen("http://127.0.0.1:8099/health", timeout=10) as response:
        health = json.loads(response.read(4096))
        report["health"] = {"http_status": response.status, "ok": health.get("ok"), "bucket": health.get("bucket")}
except Exception:
    report["health"] = {"reachable": False}
print(json.dumps(report, indent=2))

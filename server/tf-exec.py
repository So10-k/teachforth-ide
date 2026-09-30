#!/usr/bin/env python3
"""Run one allowlisted teaching program. The caller has already dropped privileges."""

import os
import pty
import json
import select
import subprocess
import sys

ALLOW = ("python3", "java", "javac", "gcc", "g++", "node")
FLAGS = {
    "-u", "-d", ".", "-cp", "-encoding", "UTF-8", "-o", "prog",
    "-std=c11", "-std=c++17", "-Wall", "-lm",
    "-Xmx128m", "-XX:CompressedClassSpaceSize=64m", "-XX:ReservedCodeCacheSize=48m", "-XX:MaxMetaspaceSize=96m",
    "-J-Xmx128m", "-J-XX:CompressedClassSpaceSize=64m", "-J-XX:ReservedCodeCacheSize=48m", "-J-XX:MaxMetaspaceSize=96m",
}
PATH_OK = __import__("re").compile(r"^[\w./+-]{1,120}$")


def resolve(name):
    if name not in ALLOW:
        return None
    for path in (f"/usr/bin/{name}", f"/usr/local/bin/{name}"):
        if os.path.isfile(path) and os.access(path, os.X_OK):
            return path
    return None


def fail(message):
    sys.stderr.write(message + "\n")
    sys.exit(2)


def check_arg(arg, binary):
    if not isinstance(arg, str) or "\0" in arg or arg.startswith("-"):
        if arg not in FLAGS:
            fail("blocked argument")
        return
    if arg in FLAGS:
        return
    if not PATH_OK.match(arg) or ".." in arg.split("/"):
        fail("blocked path")


def load_steps():
    try:
        spec = json.load(open("run.json", "r", encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        fail("missing run")
    steps = spec.get("steps")
    if not isinstance(steps, list) or not steps or len(steps) > 4:
        fail("bad run")
    clean = []
    for step in steps:
        if not isinstance(step, list) or not step or len(step) > 12:
            fail("bad step")
        if step[0] == "./prog":
            if step is not steps[-1] or len(step) != 1:
                fail("blocked program")
            clean.append(["./prog"])
            continue
        binary = resolve(step[0])
        if not binary:
            fail("blocked program")
        for arg in step[1:]:
            check_arg(arg, binary)
        clean.append([binary, *step[1:]])
    return clean


def limit():
    try:
        import resource
        resource.setrlimit(resource.RLIMIT_CPU, (60, 60))
        resource.setrlimit(resource.RLIMIT_FSIZE, (8_000_000, 8_000_000))
        resource.setrlimit(resource.RLIMIT_NPROC, (40, 40))
        resource.setrlimit(resource.RLIMIT_NOFILE, (64, 64))
    except (ImportError, ValueError, OSError):
        pass


def run_pty(cmd):
    master, slave = pty.openpty()
    proc = subprocess.Popen(cmd, stdin=slave, stdout=slave, stderr=slave, close_fds=True)
    os.close(slave)
    try:
        with open("pid", "w", encoding="utf-8") as handle:
            handle.write(str(proc.pid))
    except OSError:
        pass
    stdin = sys.stdin.fileno()
    stdout = sys.stdout.fileno()
    while True:
        watch = [master]
        if stdin is not None:
            watch.append(stdin)
        try:
            ready, _, _ = select.select(watch, [], [], 0.2)
        except (ValueError, OSError):
            break
        if stdin is not None and stdin in ready:
            try:
                data = os.read(stdin, 1024)
            except OSError:
                data = b""
            if not data:
                stdin = None
            else:
                try:
                    os.write(master, data)
                except OSError:
                    break
        if master in ready:
            try:
                data = os.read(master, 4096)
            except OSError:
                data = b""
            if not data:
                break
            try:
                os.write(stdout, data)
            except OSError:
                break
        if proc.poll() is not None and master not in ready:
            break
    code = proc.wait()
    try:
        while True:
            data = os.read(master, 4096)
            if not data:
                break
            os.write(stdout, data)
    except OSError:
        pass
    sys.exit(code if code is not None else 1)


def main():
    os.chdir(sys.argv[1] if len(sys.argv) > 1 else ".")
    os.environ.clear()
    os.environ["PATH"] = "/usr/bin:/bin"
    os.environ["HOME"] = os.getcwd()
    os.environ["TMPDIR"] = os.getcwd()
    os.environ["LANG"] = "C.UTF-8"
    os.environ["PYTHONUNBUFFERED"] = "1"
    os.environ["PYTHONDONTWRITEBYTECODE"] = "1"
    steps = load_steps()
    limit()
    for step in steps[:-1]:
        done = subprocess.run(step, stdout=sys.stdout, stderr=sys.stderr)
        if done.returncode != 0:
            sys.exit(done.returncode)
    last = steps[-1]
    if last[0] == "./prog":
        real = os.path.realpath("./prog")
        root = os.path.realpath(".")
        if os.path.islink("./prog") or not os.path.isfile(real) or not real.startswith(root + os.sep):
            fail("blocked program")
    run_pty(last)


if __name__ == "__main__":
    main()

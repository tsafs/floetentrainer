#!/usr/bin/env python3
"""Liest die Lieder aus heft/songs.py und gibt sie als JSON aus (für scripts/heft-songs-plugin.ts).

Aufruf: python3 scripts/heft-songs.py [Pfad zu songs.py] [--ref]

- heft/ wird nur gelesen: kein __pycache__ (sys.dont_write_bytecode), nichts wird dort abgelegt.
- Das Kapitel gilt wie im Heft für alle folgenden Lieder bis zum nächsten Kapitel.
- Mit --ref kommen zusätzlich die Ergebnisse von parse_music/check_and_assign aus heft/engrave.py
  mit (nur für die Kreuzprüfung in den Tests). engrave.py braucht Pillow nur für Textbreiten im
  Notensatz; fehlt Pillow, wird es durch eine leere Attrappe ersetzt, denn Leser und Silbenzuordnung
  brauchen es nicht.
"""
import importlib.util
import json
import os
import runpy
import sys
import types

sys.dont_write_bytecode = True

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT = os.path.normpath(os.path.join(HERE, "..", "..", "heft", "songs.py"))


def load_songs(path):
    ns = runpy.run_path(path, run_name="heft_songs")
    songs = ns.get("SONGS")
    if not isinstance(songs, list):
        raise SystemExit(f"{path}: keine Liste SONGS gefunden")
    out, chapter = [], None
    for i, s in enumerate(songs):
        if not isinstance(s, dict) or "title" not in s or "music" not in s:
            raise SystemExit(f"{path}: Lied Nr. {i + 1} hat keinen Titel oder keine Melodie")
        if s.get("chapter"):
            chapter = s["chapter"]
        d = {k: (list(v) if isinstance(v, tuple) else v) for k, v in s.items()}
        d["chapter"] = chapter
        out.append(d)
    return out


def load_engrave(heft_dir):
    try:
        import PIL.ImageFont  # noqa: F401
    except ImportError:
        pil = types.ModuleType("PIL")
        pil.ImageFont = types.ModuleType("PIL.ImageFont")
        sys.modules["PIL"], sys.modules["PIL.ImageFont"] = pil, pil.ImageFont
    spec = importlib.util.spec_from_file_location("heft_engrave", os.path.join(heft_dir, "engrave.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def reference(eng, song):
    """Notenfolge, Silben und Meldungen so, wie das Heft sie berechnet."""
    items, msgs = eng.check_and_assign(song)
    ev = []
    for it in items:
        if it["kind"] == "note":
            p = it["p"]
            ev.append(dict(kind="note", name=p["name"], oct=p["oct"], letter=p["letter"], alt=p["alt"],
                           pos=p["pos"], q=it["q"], tie=it["tie"], slurStart=it["slur_start"],
                           slurEnd=it["slur_end"], breath=bool(it.get("breath")),
                           syl=it.get("syl"), hy=bool(it.get("hy"))))
        elif it["kind"] == "rest":
            ev.append(dict(kind="rest", q=it["q"]))
    return dict(events=ev, msgs=msgs)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    path = os.path.abspath(args[0] if args else DEFAULT)
    songs = load_songs(path)
    if "--ref" in sys.argv:
        eng = load_engrave(os.path.dirname(path))
        for s in songs:
            s["ref"] = reference(eng, dict(s, time=tuple(s["time"])))
    json.dump(songs, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()

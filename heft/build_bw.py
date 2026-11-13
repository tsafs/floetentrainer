import os
from build import grifftabelle, liederheft, OUT
MAP = {"#2b2724": "#000000", "#5d554d": "#000000", "#8c8379": "#000000", "#9c8462": "#000000",
       "#a39a90": "#000000", "#a58c68": "#000000", "#b8a27e": "#000000", "#bfb3a5": "#000000",
       "#cdb68f": "#ffffff", "#efe4cf": "#ffffff", "#efe7da": "#000000", "#fffdf8": "#ffffff"}
def bw(h):
    h = h.replace("border-top: 0.35mm solid #cdb68f", "border-top: 0.3mm solid #000000")
    h = h.replace('opacity="0.7"', "")
    for a, b in MAP.items():
        h = h.replace(a, b)
    return h
if __name__ == "__main__":
    open(os.path.join(OUT, "grifftabelle-sw.html"), "w").write(bw(grifftabelle()))
    open(os.path.join(OUT, "liederheft-sw.html"), "w").write(bw(liederheft()))

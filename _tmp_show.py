from pathlib import Path
t = Path(r"D:\Java\api\oioi-canvas\web\src\pages\video\index.tsx").read_text(encoding="utf-8")
i = t.find('<div className="mt-3 flex items-center gap-2">')
j = t.find('<div className="mt-3 flex min-w-0 flex-col gap-2 border-t')
print("i", i, "j", j)
print(t[i:j])

import math, sys
C, S = math.cos(math.radians(30)), 0.5
OX, OY = 250, 330
BB = [1e9, 1e9, -1e9, -1e9]
def P(x, y, z):
    px, py = OX + (x - y) * C, OY + (x + y) * S - z
    BB[0] = min(BB[0], px); BB[1] = min(BB[1], py); BB[2] = max(BB[2], px); BB[3] = max(BB[3], py)
    return (px, py)
def pts(ps): return " ".join(f"{a:.1f},{b:.1f}" for a, b in ps)
out = []
SW = 1.7
def poly(ps3, fill="#fff", extra=""):
    out.append(f'<polygon points="{pts([P(*p) for p in ps3])}" fill="{fill}" stroke="#000" stroke-width="{SW}" stroke-linejoin="round" {extra}/>')
def line(a, b, w=SW, dash=None, col="#000"):
    (x1, y1), (x2, y2) = P(*a), P(*b)
    d = f' stroke-dasharray="{dash}"' if dash else ""
    out.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{col}" stroke-width="{w}" stroke-linecap="round"{d}/>')
def tube(a, b, w=7):  # dış hatlı boru: siyah kalın + beyaz ince
    line(a, b, w); line(a, b, w - 2 * SW, col="#fff")
def box(x, y, z, dx, dy, dz, top="#fff", fx="#fff", fy="#fff"):
    # görünen yüzler: üst (+z), +x yüzü, +y yüzü
    poly([(x, y + dy, z), (x + dx, y + dy, z), (x + dx, y + dy, z + dz), (x, y + dy, z + dz)], fy)
    poly([(x + dx, y, z), (x + dx, y + dy, z), (x + dx, y + dy, z + dz), (x + dx, y, z + dz)], fx)
    poly([(x, y, z + dz), (x + dx, y, z + dz), (x + dx, y + dy, z + dz), (x, y + dy, z + dz)], top)
def circle_x(cx, cy, cz, r, n=40, fill="#fff"):  # +x yönüne bakan daire (y-z düzleminde)
    poly([(cx, cy + r * math.cos(t), cz + r * math.sin(t)) for t in [2 * math.pi * i / n for i in range(n)]], fill)
def circle_z(cx, cy, cz, r, n=40, fill="#fff", extra=""):
    poly([(cx + r * math.cos(t), cy + r * math.sin(t), cz) for t in [2 * math.pi * i / n for i in range(n)]], fill, extra)

# --- zemin: kesikli alan ve kablo
fl = [(-160, -140, 0), (150, -140, 0), (150, 110, 0), (-160, 110, 0)]
for i in range(4): line(fl[i], fl[(i + 1) % 4], 1.4, "3 4")

# --- softbox standı (arkada, solda)
sx, sy = -105, -85
for ang in (90, 210, 330):
    a = math.radians(ang); tube((sx, sy, 60), (sx + 30 * math.cos(a), sy + 30 * math.sin(a), 0), 6)
tube((sx, sy, 0 + 60), (sx, sy, 190), 7)
# softbox: arka küçük kare, ön büyük kare (ön yüz +x yönüne bakıyor)
bz = 205; bx = sx + 6
back = [(bx, sy - 16, bz - 16), (bx, sy + 16, bz - 16), (bx, sy + 16, bz + 16), (bx, sy - 16, bz + 16)]
fx_ = bx + 46
front = [(fx_, sy - 52, bz - 52), (fx_, sy + 52, bz - 52), (fx_, sy + 52, bz + 52), (fx_, sy - 52, bz + 52)]
# görünen yan yüzler: üst ve +y
poly([back[3], back[2], front[2], front[3]], "url(#ht)")            # üst
poly([back[1], back[2], front[2], front[1]], "#000")                 # +y yan (koyu)
poly(front, "#fff")                                                   # ön difüzör
inset = [(fx_ + 0.1, sy - 40, bz - 40), (fx_ + 0.1, sy + 40, bz - 40), (fx_ + 0.1, sy + 40, bz + 40), (fx_ + 0.1, sy - 40, bz + 40)]
poly(inset, "none", 'stroke-dasharray="3 4"')
line((bx, sy, bz), (bx - 4, sy, bz - 14), 3)

# --- tripod + kamera (ortada)
tx, ty = -70, 45
for ang in (40, 160, 280):
    a = math.radians(ang); tube((tx, ty, 120), (tx + 42 * math.cos(a), ty + 42 * math.sin(a), 0), 6)
tube((tx, ty, 118), (tx, ty, 150), 8)
box(tx - 12, ty - 10, 150, 24, 20, 6, top="#fff", fx="#000", fy="#fff")  # tabla
# gövde
box(tx - 22, ty - 16, 156, 34, 32, 26, top="#fff", fx="#fff", fy="#fff")
box(tx - 18, ty - 6, 182, 14, 14, 8, top="#000", fx="#fff", fy="#fff")    # vizör
line((tx - 22, ty + 16, 166), (tx + 12, ty + 16, 166), 1.2)
# lens (+x yönünde silindir: daireler ve kenarlar)
lx = tx + 12; lc = (ty, 169)
for k in range(0, 23, 2):
    circle_x(lx + k, lc[0], lc[1], 11 if k < 14 else 12.5, fill="#fff" if k < 22 else "#fff")
circle_x(lx + 22, lc[0], lc[1], 12.5, fill="#fff")
circle_x(lx + 22.2, lc[0], lc[1], 8, fill="#000")
circle_x(lx + 22.4, lc[0] - 2.5, lc[1] + 2.5, 2.2, fill="#fff")

# --- kablo: kameradan zemine kesikli
line((tx + 10, ty + 16, 160), (tx + 30, ty + 70, 0), 1.3, "2 4")
line((tx + 30, ty + 60, 0), (40, 100, 0), 1.3, "2 4")
circle_z(40, 100, 0, 5, fill="#fff")

# --- sehpa ve ürün kutusu (önde, sağda: çekilen ürün)
box(55, -5, 0, 60, 60, 48, top="#fff", fx="#000", fy="#fff")
line((55, 55, 18), (115, 55, 18), SW); line((115, -5, 18), (115, 55, 18), 1.2, col="#fff")
box(72, 12, 48, 26, 26, 34, top="url(#ht)", fx="#fff", fy="#fff")    # ürün kutusu
line((72, 38, 70), (98, 38, 70), 1.2)
circle_z(85, 25, 82.2, 6, fill="#fff")

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="{BB[0]-6:.0f} {BB[1]-6:.0f} {BB[2]-BB[0]+12:.0f} {BB[3]-BB[1]+12:.0f}" width="{BB[2]-BB[0]+12:.0f}" height="{BB[3]-BB[1]+12:.0f}">
<defs><pattern id="ht" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="4" fill="#fff"/><circle cx="2" cy="2" r=".9" fill="#000"/></pattern></defs>
{chr(10).join(out)}
</svg>'''
open(sys.argv[1], "w").write(svg)

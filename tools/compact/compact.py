#!/usr/bin/env python3
"""Makes a 'more zoomed out' copy of app/styles.css: text and spacing scaled down by rule, never touching text boxes (iPhone zooms the page if they go
under 16px), the tab bar or the iPhone safe-area rules. Usage: compact.py <in.css> <out.css> <fontFactor> <spaceFactor> <lighter 0|1>"""
import re, sys
src = open(sys.argv[1], encoding='utf-8').read(); F = float(sys.argv[2+1]); SP = float(sys.argv[4]); LIGHT = sys.argv[5] == '1'
def half(x): return ('%g' % (round(x * 2) / 2))
def body(sel, decls):
    s = sel.lower()
    if re.search(r'#tabs|statusband|^\s*html|:root|@', s): return decls
    boxes = bool(re.search(r'input|select|textarea', s))
    def font(m):
        n = float(m.group(1)); 
        if boxes or n < 12: return m.group(0)
        return 'font-size: %spx' % half(max(11, n * F))
    decls = re.sub(r'font-size:\s*([\d.]+)px', font, decls)
    def space(m):
        prop, val = m.group(1), m.group(2)
        if re.search(r'calc|env|var|%|auto', val): return m.group(0)
        def num(k):
            n = float(k.group(2)); 
            return k.group(0) if n < 8 else '%s%spx' % (k.group(1), half(n * SP))
        return '%s: %s' % (prop, re.sub(r'(-?)([\d.]+)px', num, val))
    decls = re.sub(r'\b(padding(?:-\w+)?|margin(?:-\w+)?|gap)\s*:\s*([^;}]+)', space, decls)
    decls = re.sub(r'border-radius:\s*([\d.]+)px', lambda m: m.group(0) if float(m.group(1)) < 12 or float(m.group(1)) > 100 else 'border-radius: %spx' % half(float(m.group(1)) * 0.8), decls)
    if LIGHT: decls = decls.replace('font-weight: 800', 'font-weight: 700') if 'h1' in s or 'bigtotal' in s else decls.replace('font-weight: 700', 'font-weight: 600').replace('font-weight: 800', 'font-weight: 700')
    return decls
out = re.sub(r'([^{}]+)\{([^{}]*)\}', lambda m: m.group(1) + '{' + body(m.group(1), m.group(2)) + '}', src)
out = out.replace('--radius: 18px', '--radius: 14px').replace('font: 16px/1.45 "Inter"', 'font: %spx/1.42 "Inter"' % half(16 * F))
open(sys.argv[2], 'w', encoding='utf-8').write(out); print('wrote', sys.argv[2], len(out))

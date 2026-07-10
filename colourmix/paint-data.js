// Paint catalogues per medium. Hexes are approximate masstone colours.
export const CATALOGUES = {
  oil: [
    { id: 'wn-winsor-lemon',  brand: 'Winsor & Newton', name: 'Winsor Lemon',            code: 'PY175', hex: '#F4E01F' },
    { id: 'wn-winsor-yellow', brand: 'Winsor & Newton', name: 'Winsor Yellow',           code: 'PY97',  hex: '#F4E438' },
    { id: 'wn-cad-yellow',    brand: 'Winsor & Newton', name: 'Cadmium Yellow',          code: 'PY35',  hex: '#F6BE00' },
    { id: 'wn-cad-orange',    brand: 'Winsor & Newton', name: 'Cadmium Orange',          code: 'PO20',  hex: '#E8722A' },
    { id: 'wn-cad-red',       brand: 'Winsor & Newton', name: 'Cadmium Red',             code: 'PR108', hex: '#C42E2B' },
    { id: 'wn-perm-rose',     brand: 'Winsor & Newton', name: 'Permanent Rose',          code: 'PV19',  hex: '#C4266E' },
    { id: 'wn-aliz',          brand: 'Winsor & Newton', name: 'Alizarin Crimson',        code: 'PR83',  hex: '#8E1F33' },
    { id: 'wn-winsor-violet', brand: 'Winsor & Newton', name: 'Winsor Violet',           code: 'PV23',  hex: '#472B7A' },
    { id: 'wn-ultramarine',   brand: 'Winsor & Newton', name: 'French Ultramarine',      code: 'PB29',  hex: '#1B2E6F' },
    { id: 'wn-winsor-blue',   brand: 'Winsor & Newton', name: 'Winsor Blue (GS)',        code: 'PB15:3',hex: '#1D5A80' },
    { id: 'wn-cerulean',      brand: 'Winsor & Newton', name: 'Cerulean Blue',           code: 'PB35',  hex: '#2A6FA8' },
    { id: 'wn-winsor-green',  brand: 'Winsor & Newton', name: 'Winsor Green (BS)',       code: 'PG7',   hex: '#2E5D3A' },
    { id: 'wn-viridian',      brand: 'Winsor & Newton', name: 'Viridian',                code: 'PG18',  hex: '#2C8F78' },
    { id: 'wn-sap-green',     brand: 'Winsor & Newton', name: 'Sap Green',               code: 'PG36',  hex: '#5A6E28' },
    { id: 'wn-yellow-ochre',  brand: 'Winsor & Newton', name: 'Yellow Ochre',            code: 'PY43',  hex: '#C8912B' },
    { id: 'wn-raw-sienna',    brand: 'Winsor & Newton', name: 'Raw Sienna',              code: 'PBr7',  hex: '#B07A33' },
    { id: 'wn-burnt-sienna',  brand: 'Winsor & Newton', name: 'Burnt Sienna',            code: 'PR101', hex: '#8C3B24' },
    { id: 'wn-light-red',     brand: 'Winsor & Newton', name: 'Light Red',               code: 'PR102', hex: '#B23A28' },
    { id: 'wn-burnt-umber',   brand: 'Winsor & Newton', name: 'Burnt Umber',             code: 'PBr7',  hex: '#4A3222' },
    { id: 'wn-raw-umber',     brand: 'Winsor & Newton', name: 'Raw Umber',               code: 'PBr7',  hex: '#5C4B32' },
    { id: 'wn-titanium',      brand: 'Winsor & Newton', name: 'Titanium White',          code: 'PW6',   hex: '#F8F7F2', white: true },
    { id: 'wn-ivory-black',   brand: 'Winsor & Newton', name: 'Ivory Black',             code: 'PBk9',  hex: '#26211C' },
    { id: 'mh-titanium',      brand: 'Michael Harding', name: 'Titanium White No.1',     code: 'PW6',   hex: '#F9F8F3', white: true },
    { id: 'mh-bright-green',  brand: 'Michael Harding', name: 'Bright Green Lake',       code: 'PG7·PY3', hex: '#3E8A3C' },
    { id: 'mh-magenta',       brand: 'Michael Harding', name: 'Magenta',                 code: 'PR122', hex: '#B03580' },
    { id: 'oh-ruby',          brand: 'Old Holland',     name: 'Ruby Lake',               code: 'PV19',  hex: '#C0256B' },
    { id: 'oh-manganese',     brand: 'Old Holland',     name: 'Manganese Violet',        code: 'PV16',  hex: '#5B3A8E' },
    { id: 'oh-viridian-deep', brand: 'Old Holland',     name: 'Viridian Green Deep',     code: 'PG18',  hex: '#27866F' }
  ],
  acrylic: [
    { id: 'lq-yellow-light',  brand: 'Liquitex', name: 'Yellow Light Hansa',      code: 'PY3',   hex: '#F7E23B' },
    { id: 'lq-cad-yellow',    brand: 'Liquitex', name: 'Cadmium Yellow Medium',   code: 'PY35',  hex: '#F5BD02' },
    { id: 'lq-cad-orange',    brand: 'Liquitex', name: 'Cadmium Orange',          code: 'PO20',  hex: '#E67420' },
    { id: 'lq-cad-red',       brand: 'Liquitex', name: 'Cadmium Red Medium',      code: 'PR108', hex: '#C6302B' },
    { id: 'lq-quin-magenta',  brand: 'Liquitex', name: 'Quinacridone Magenta',    code: 'PR122', hex: '#A93A77' },
    { id: 'lq-diox-purple',   brand: 'Liquitex', name: 'Dioxazine Purple',        code: 'PV23',  hex: '#46256E' },
    { id: 'lq-ultramarine',   brand: 'Liquitex', name: 'Ultramarine Blue',        code: 'PB29',  hex: '#23357C' },
    { id: 'lq-phthalo-blue',  brand: 'Liquitex', name: 'Phthalo Blue (GS)',       code: 'PB15:3',hex: '#1A5B8C' },
    { id: 'lq-phthalo-green', brand: 'Liquitex', name: 'Phthalo Green',           code: 'PG7',   hex: '#1F6B52' },
    { id: 'lq-green-light',   brand: 'Liquitex', name: 'Light Green Permanent',   code: 'PY3·PG7', hex: '#5EA345' },
    { id: 'lq-yellow-oxide',  brand: 'Liquitex', name: 'Yellow Oxide',            code: 'PY42',  hex: '#C08F2E' },
    { id: 'lq-burnt-sienna',  brand: 'Liquitex', name: 'Burnt Sienna',            code: 'PBr7',  hex: '#8A3D26' },
    { id: 'lq-burnt-umber',   brand: 'Liquitex', name: 'Burnt Umber',             code: 'PBr7',  hex: '#4C3524' },
    { id: 'lq-titanium',      brand: 'Liquitex', name: 'Titanium White',          code: 'PW6',   hex: '#F8F8F3', white: true },
    { id: 'lq-mars-black',    brand: 'Liquitex', name: 'Mars Black',              code: 'PBk11', hex: '#24211E' },
    // Specialty & fluorescent — true fluorescents are essentially an acrylic-only
    // medium (dye-based, don't hold up in oil); these give the recipe engine real
    // high-chroma options for neon targets that no traditional pigment can reach.
    { id: 'golden-fluor-yellow', brand: 'Golden', name: 'Fluorescent Yellow-Green', code: 'Fluorescent', hex: '#E7FA1E', special: true },
    { id: 'golden-fluor-green',  brand: 'Golden', name: 'Fluorescent Green',        code: 'Fluorescent', hex: '#1EFA6E', special: true },
    { id: 'golden-fluor-blue',   brand: 'Golden', name: 'Fluorescent Blue',         code: 'Fluorescent', hex: '#1FA8FF', special: true },
    { id: 'golden-fluor-pink',   brand: 'Golden', name: 'Fluorescent Pink',         code: 'Fluorescent', hex: '#FF2D8A', special: true },
    { id: 'golden-fluor-orange', brand: 'Golden', name: 'Fluorescent Orange',       code: 'Fluorescent', hex: '#FF6A1A', special: true }
  ],
  watercolour: [
    { id: 'wc-winsor-lemon',  brand: 'Winsor & Newton', name: 'Winsor Lemon',        code: 'PY175', hex: '#F2E13C' },
    { id: 'wc-transp-yellow', brand: 'Winsor & Newton', name: 'Transparent Yellow',  code: 'PY150', hex: '#E8B71E' },
    { id: 'wc-cad-yellow',    brand: 'Winsor & Newton', name: 'Cadmium Yellow',      code: 'PY35',  hex: '#F3BC1E' },
    { id: 'wc-scarlet',       brand: 'Winsor & Newton', name: 'Scarlet Lake',        code: 'PR188', hex: '#CE3A2E' },
    { id: 'wc-perm-rose',     brand: 'Winsor & Newton', name: 'Permanent Rose',      code: 'PV19',  hex: '#C64B79' },
    { id: 'wc-aliz',          brand: 'Winsor & Newton', name: 'Alizarin Crimson',    code: 'PR83',  hex: '#97263F' },
    { id: 'wc-winsor-violet', brand: 'Winsor & Newton', name: 'Winsor Violet',       code: 'PV23',  hex: '#5A3E85' },
    { id: 'wc-ultramarine',   brand: 'Winsor & Newton', name: 'French Ultramarine',  code: 'PB29',  hex: '#2A3F8F' },
    { id: 'wc-cerulean',      brand: 'Winsor & Newton', name: 'Cerulean Blue',       code: 'PB35',  hex: '#3577A8' },
    { id: 'wc-winsor-green',  brand: 'Winsor & Newton', name: 'Winsor Green (BS)',   code: 'PG7',   hex: '#2D7057' },
    { id: 'wc-sap-green',     brand: 'Winsor & Newton', name: 'Sap Green',           code: 'PG36',  hex: '#6B7A2E' },
    { id: 'wc-yellow-ochre',  brand: 'Winsor & Newton', name: 'Yellow Ochre',        code: 'PY43',  hex: '#C79939' },
    { id: 'wc-burnt-sienna',  brand: 'Winsor & Newton', name: 'Burnt Sienna',        code: 'PR101', hex: '#99502C' },
    { id: 'wc-burnt-umber',   brand: 'Winsor & Newton', name: 'Burnt Umber',         code: 'PBr7',  hex: '#5C4632' },
    { id: 'wc-neutral-tint',  brand: 'Winsor & Newton', name: 'Neutral Tint',        code: 'PBk6·PB15', hex: '#3C3A44' },
    { id: 'water',            brand: '',                name: 'water',               code: '',      hex: '#FDFCF8', water: true }
  ]
};

export const DEFAULT_INVENTORY = {
  oil: [
    'wn-cad-yellow', 'wn-winsor-lemon', 'wn-cad-red', 'wn-burnt-sienna',
    'wn-ultramarine', 'wn-winsor-blue', 'wn-winsor-green', 'wn-yellow-ochre',
    'wn-burnt-umber', 'wn-titanium', 'wn-ivory-black', 'wn-light-red',
    'mh-titanium', 'mh-bright-green', 'mh-magenta',
    'oh-manganese', 'oh-viridian-deep'
  ],
  acrylic: [
    'lq-cad-yellow', 'lq-cad-red', 'lq-ultramarine', 'lq-phthalo-green',
    'lq-yellow-oxide', 'lq-burnt-umber', 'lq-titanium', 'lq-mars-black'
  ],
  watercolour: [
    'wc-winsor-lemon', 'wc-cad-yellow', 'wc-scarlet', 'wc-ultramarine',
    'wc-winsor-green', 'wc-yellow-ochre', 'wc-burnt-sienna', 'wc-burnt-umber',
    'wc-neutral-tint', 'water'
  ]
};

export const MEDIUM_LABELS = { oil: 'Oil', acrylic: 'Acrylic', watercolour: 'Watercolour' };

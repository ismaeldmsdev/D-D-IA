/* ═══════════════════════════════════════════════════════
   CONFIGURACIÓN Y DATOS ESTÁTICOS
   Cargado como <script> normal — sin ES modules
   ════════════════════════════════════════════════════ */

window._RPG = window._RPG || {};

Object.assign(window._RPG, {

  MAX_TOKENS:    1400,
  HISTORY_LIMIT: 14,

  SKILLS: [
    { id: 'athletics',     label: 'Atletismo',      attr: 'str' },
    { id: 'acrobatics',    label: 'Acrobacias',     attr: 'dex' },
    { id: 'stealth',       label: 'Sigilo',          attr: 'dex' },
    { id: 'sleight',       label: 'Juego de Manos', attr: 'dex' },
    { id: 'arcana',        label: 'Arcano',          attr: 'int' },
    { id: 'history',       label: 'Historia',        attr: 'int' },
    { id: 'investigation', label: 'Investigación',   attr: 'int' },
    { id: 'nature',        label: 'Naturaleza',      attr: 'int' },
    { id: 'religion',      label: 'Religión',        attr: 'int' },
    { id: 'animal',        label: 'Trato Animales',  attr: 'wis' },
    { id: 'insight',       label: 'Perspicacia',     attr: 'wis' },
    { id: 'medicine',      label: 'Medicina',        attr: 'wis' },
    { id: 'perception',    label: 'Percepción',      attr: 'wis' },
    { id: 'survival',      label: 'Supervivencia',   attr: 'wis' },
    { id: 'deception',     label: 'Engaño',          attr: 'cha' },
    { id: 'intimidation',  label: 'Intimidación',    attr: 'cha' },
    { id: 'performance',   label: 'Actuación',       attr: 'cha' },
    { id: 'persuasion',    label: 'Persuasión',      attr: 'cha' },
  ],

  XP_TABLE: [
    0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000,
    85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000,
  ],

  ATTR_ABBR:  { str:'FUE', dex:'DES', con:'CON', int:'INT', wis:'SAB', cha:'CAR' },
  ATTR_CLASS: { str:'tag-str', dex:'tag-dex', con:'tag-con', int:'tag-int', wis:'tag-wis', cha:'tag-cha' },
  ASI_LEVELS: new Set([4, 8, 12, 16, 19]),
  STAT_TO_ES: { str:'fuerza', dex:'destreza', con:'constitucion', int:'inteligencia', wis:'sabiduria', cha:'carisma' },

  ATTR_MAP: {
    str:'str', fue:'str', fuerza:'str',
    dex:'dex', des:'dex', destreza:'dex',
    con:'con', constitucion:'con',
    int:'int', inteligencia:'int',
    wis:'wis', sab:'wis', sabiduria:'wis',
    cha:'cha', car:'cha', carisma:'cha',
    atletismo:'str',
    acrobacias:'dex', sigilo:'dex', 'juego de manos':'dex',
    arcano:'int', historia:'int', investigacion:'int', naturaleza:'int', religion:'int',
    'trato animales':'wis', perspicacia:'wis', medicina:'wis', percepcion:'wis', supervivencia:'wis',
    engano:'cha', intimidacion:'cha', actuacion:'cha', persuasion:'cha',
  },

  resolveAttr(raw) {
    const normalized = raw.toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .trim();
    return this.ATTR_MAP[normalized] || this.ATTR_MAP[raw.toLowerCase()] || 'str';
  },

  isConsumable(name) {
    return /poci[oó]n|consumible|hierba|ung[uü]ento|elixir|poderoso/i.test(name);
  },

});

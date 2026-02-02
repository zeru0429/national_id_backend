const path = require("path");

// Base directories
const BASE_PUBLIC = path.join(__dirname, "../../public");
const OUTPUT_DIR = path.join(BASE_PUBLIC, "output");
const TEMP_DIR = path.join(OUTPUT_DIR, "tmp");
const TEMPLATE_DIR = path.join(BASE_PUBLIC, "templates");
const FONT_DIR = path.join(BASE_PUBLIC, "fonts");

// Templates
const FRONT_TEMPLATE = path.join(TEMPLATE_DIR, "front-template.jpg");
const BACK_TEMPLATE = path.join(TEMPLATE_DIR, "back-template.jpg");

// Fonts
const MYRIAD_PRO = {
  regular: path.join(FONT_DIR, "myriad-pro/MYRIADPRO-REGULAR.OTF"),
  bold: path.join(FONT_DIR, "myriad-pro/MYRIADPRO-BOLD.OTF"),
  semibold: path.join(FONT_DIR, "myriad-pro/MYRIADPRO-SEMIBOLD.OTF"),
  light: path.join(FONT_DIR, "myriad-pro/MyriadPro-Light.otf"),
};

const EBRIMA = {
  regular: path.join(FONT_DIR, "ebrimabd/ebrima.ttf"),
  bold: path.join(FONT_DIR, "ebrimabd/EbrimaBold.ttf"),
};

module.exports = {
  BASE_PUBLIC,
  OUTPUT_DIR,
  TEMP_DIR,
  TEMPLATE_DIR,
  FRONT_TEMPLATE,
  BACK_TEMPLATE,
  MYRIAD_PRO,
  EBRIMA,
};

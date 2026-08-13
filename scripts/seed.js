/**
 * Ershaye (እርሻዬ) — seed script
 * Seeds categories, products, admin account, and blog posts into the Neon DB.
 * Idempotent: safe to re-run.
 *
 * Usage: node scripts/seed.js
 */
import dotenv from "dotenv";
import bcrypt from "bcrypt";
import pool, { initDB } from "../config/db.js";

dotenv.config();

const categories = [
  {
    name: "leafy-greens",
    name_en: "Leafy Greens",
    name_am: "ቅጠላ ቅጠል",
    description_en: "Crisp, chemical-free greens harvested daily from our towers.",
    description_am: "በየዕለቱ ከግንቦቻችን የሚሰበሰቡ ጥሩ መዓዛ ያላቸው ቅጠላ ቅጠሎች።",
    sort_order: 1,
  },
  {
    name: "herbs",
    name_en: "Herbs",
    name_am: "ቅመማ ቅመም",
    description_en: "Aromatic herbs grown with aeroponic precision.",
    description_am: "በአየር እርሻ ቴክኖሎጂ የተበቀሉ መዓዛ ያላቸው ቅመማ ቅመሞች።",
    sort_order: 2,
  },
  {
    name: "vegetables",
    name_en: "Vegetables",
    name_am: "አትክልቶች",
    description_en: "Fresh, nutrient-rich vegetables for every Ethiopian kitchen.",
    description_am: "ለእያንዳንዱ የኢትዮጵያ ኩሽና የሚሆኑ ትኩስ አትክልቶች።",
    sort_order: 3,
  },
  {
    name: "fruits",
    name_en: "Fruits",
    name_am: "ፍራፍሬዎች",
    description_en: "Sweet, ripe fruits — some grown right on our towers.",
    description_am: "ጣፋጭ እና የበሰሉ ፍራፍሬዎች — ከግንቦቻችን ላይ የተሰበሰቡ።",
    sort_order: 4,
  },
  {
    name: "materials",
    name_en: "Farming Materials",
    name_am: "የእርሻ ቁሳቁሶች",
    description_en: "Hydroponic towers, nutrients, and equipment for growing fresh produce at home.",
    description_am: "በቤት ውስጥ ትኩስ ምርት ለማምረት የሚያስፈልጉ የሃይድሮፖኒክስ ማማዎች፣ ንጥረ-ምግቦች እና መሳሪያዎች።",
    sort_order: 5,
  },
  {
    name: "ebooks",
    name_en: "eBooks",
    name_am: "ኢ-መጽሐፍት",
    description_en: "Digital guides to start and grow your own hydroponic farm — instantly downloadable.",
    description_am: "የራስዎን የሃይድሮፖኒክስ እርሻ ለመጀመር እና ለማሳደግ ዲጂታል መመሪያዎች — ወዲያውኑ የሚወርዱ።",
    sort_order: 6,
  },
];

/** Build a self-contained base64 SVG image for a product/post (no external URLs). */
const makeImage = (emoji, label) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#d8f3dc"/><stop offset="100%" stop-color="#74c69d"/></linearGradient></defs><rect width="800" height="600" fill="url(#g)"/><circle cx="400" cy="230" r="150" fill="rgba(255,255,255,0.35)"/><text x="400" y="270" font-size="170" text-anchor="middle">${emoji}</text><text x="400" y="480" font-size="44" font-family="Inter, sans-serif" font-weight="700" fill="#1b4332" text-anchor="middle">${label}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
};

const products = [
  {
    cat: "leafy-greens",
    name_en: "Green Lettuce",
    name_am: "አረንጓዴ ሰላጣ",
    price: 60, unit: "bunch", unit_am: "እሽግ", emoji: "🥬",
    short_en: "Crisp, mild leaves — the perfect salad base.",
    short_am: "ለሰላጣ ተስማሚ የሆነ ጥርሳማ ቅጠል።",
    description_en: "Our signature green lettuce is grown aeroponically with pure mineral nutrients — no soil, no pesticides. Harvested the same day it reaches your table.",
    description_am: "የእኛ ተፈራሚ አረንጓዴ ሰላጣ በንጹህ ማዕድን ንጥረ ነገር ያለ አፈርና ፀረ ተባይ ይበቅላል። በተመሳሳይ ቀን ይሰበሰባል።",
    featured: true,
  },
  {
    cat: "leafy-greens",
    name_en: "Romaine Lettuce",
    name_am: "ሮማይን ሰላጣ",
    price: 70, unit: "bunch", unit_am: "እሽግ", emoji: "🥬",
    short_en: "Tall, crunchy leaves with a satisfying snap.",
    short_am: "ረዥምና ጥርሳማ ቅጠል ያለው።",
    description_en: "Romaine grows tall and crunchy in our towers, packing more vitamins per leaf. Great in salads and sandwiches.",
    description_am: "ሮማይን በግንቦቻችን ውስጥ ረዥምና ጥርሳማ ሆኖ ይበቅላል፤ በቪታሚን የበለጸገ ነው።",
    featured: true,
  },
  {
    cat: "leafy-greens",
    name_en: "Baby Spinach",
    name_am: "ቢቢ ስፒናች",
    price: 80, unit: "bunch", unit_am: "እሽግ", emoji: "🍃",
    short_en: "Tender, sweet leaves packed with iron.",
    short_am: "በብረት የበለጸጉ ለስላሳ ቅጠሎች።",
    description_en: "Tender baby spinach harvested young for the sweetest, most tender leaves. Iron-rich and perfect for smoothies and salads.",
    description_am: "ወጣት ቢቢ ስፒናች ለጣፋጭነቱ ተሰብስቦ ይቀርባል። ለስላሳ መጠጦች እና ሰላጣ ተስማሚ።",

  },
  {
    cat: "leafy-greens",
    name_en: "Kale (Gomen)",
    name_am: "ጎመን ቅጠል",
    price: 55, unit: "bunch", unit_am: "እሽግ", emoji: "🥬",
    short_en: "Dark, sturdy leaves — Ethiopia's favorite green.",
    short_am: "የኢትዮጵያ ተወዳጅ ጥቁር አረንጓዴ ቅጠል።",
    description_en: "Sturdy dark green leaves perfect for gomen wat, sautés, and smoothies. Grown pesticide-free in our towers.",
    description_am: "ለጎመን ወጥ፣ ለስቅላ እና ለስላሳ መጠጦች ተስማሚ ጠንካራ ጥቁር አረንጓዴ ቅጠል።",

  },
  {
    cat: "leafy-greens",
    name_en: "Swiss Chard",
    name_am: "ስዊስ ቻርድ",
    price: 65, unit: "bunch", unit_am: "እሽግ", emoji: "🥬",
    short_en: "Colorful stalks with a mild, earthy flavor.",
    short_am: "ቀለማት ያላቸው ግንዶች ያሉት ቅጠል።",
    description_en: "Bright stalks and tender leaves with a mild earthy flavor. Beautiful in any dish and packed with vitamins.",
    description_am: "በቪታሚን የበለጸገ፣ ቀለማት ያላቸው ግንዶችና ለስላሳ ቅጠሎች።",

  },
  {
    cat: "leafy-greens",
    name_en: "Arugula",
    name_am: "አሩጉላ",
    price: 75, unit: "bunch", unit_am: "እሽግ", emoji: "🌱",
    short_en: "Peppery, nutty leaves for gourmet salads.",
    short_am: "ለምግብ አዘጋጆች ተመራጭ ጣዕም ያለው ቅጠል።",
    description_en: "Distinctive peppery flavor loved by chefs. Grows fast in aeroponics and arrives crisp and fresh.",
    description_am: "በምግብ አዘጋጆች ዘንድ ተወዳጅ የሆነ ልዩ ጣዕም ያለው ቅጠል።",

  },
  {
    cat: "herbs",
    name_en: "Basil",
    name_am: "ባሲል",
    price: 50, unit: "bunch", unit_am: "እሽግ", emoji: "🌿",
    short_en: "Sweet, aromatic leaves for sauces and salads.",
    short_am: "ለምግብ መቅመሻ ተስማሚ መዓዛ ያለው።",
    description_en: "Sweet basil with intense aroma, grown without chemicals. Perfect for pasta, salads, and Ethiopian-style sauces.",
    description_am: "ያለ ኬሚካል የበቀለ መዓዛ ያለው ባሲል። ለፓስታ፣ ሰላጣ እና ለምግብ መቅመሻ ተስማሚ።",
    featured: true,
  },
  {
    cat: "herbs",
    name_en: "Mint",
    name_am: "ከሰር ቅጠል",
    price: 45, unit: "bunch", unit_am: "እሽግ", emoji: "🌿",
    short_en: "Cool, refreshing leaves for tea and salads.",
    short_am: "ለሻይ እና ለሰላጣ ተስማሚ ቀዝቃዛ መዓዛ።",
    description_en: "Fresh mint with a cool, refreshing kick. Ideal for tea, juice, and refreshing Ethiopian summer dishes.",
    description_am: "ለሻይ፣ ለጁስ እና ለበጋ ምግቦች ተስማሚ ቀዝቃዛ መዓዛ ያለው ከሰር ቅጠል።",

  },
  {
    cat: "herbs",
    name_en: "Coriander (Dimbilal)",
    name_am: "ድምብላል",
    price: 40, unit: "bunch", unit_am: "እሽግ", emoji: "🌿",
    short_en: "Ethiopia's essential fresh herb.",
    short_am: "የኢትዮጵያ አስፈላጊ ትኩስ ቅመም።",
    description_en: "Fresh coriander — the heart of Ethiopian cooking. Adds bright flavor to wats, salads, and sauces.",
    description_am: "የኢትዮጵያ ምግብ እምብርት የሆነው ትኩስ ድምብላል። ለወጥ፣ ሰላጣ እና መቅመሻ ተስማሚ።",

  },
  {
    cat: "herbs",
    name_en: "Rosemary",
    name_am: "ሮዝሜሪ",
    price: 60, unit: "bunch", unit_am: "እሽግ", emoji: "🌿",
    short_en: "Fragrant needles for roasted dishes.",
    short_am: "ለስጋ እና ለተጠበሰ ምግብ መዓዛ የሚሰጥ።",
    description_en: "Aromatic rosemary perfect for roasting, grilling, and infusing oils. Grown fresh on our towers.",
    description_am: "ለስጋ ጥብስ እና ለዘይት መቅመሻ ተስማሚ መዓዛ ያለው ሮዝሜሪ።",

  },
  {
    cat: "vegetables",
    name_en: "Tomatoes",
    name_am: "ቲማቲም",
    price: 90, unit: "kg", unit_am: "ኪሎ", emoji: "🍅",
    short_en: "Juicy, vine-ripened tomatoes.",
    short_am: "ጭማቂ የበዛባቸው የበሰሉ ቲማቲሞች።",
    description_en: "Juicy, flavorful tomatoes — the base of countless Ethiopian dishes. Grown with clean mineral nutrition.",
    description_am: "ለብዙ የኢትዮጵያ ምግቦች መሰረት የሆኑ ጣፋጭ ቲማቲሞች።",
    featured: true,
  },
  {
    cat: "vegetables",
    name_en: "Bell Peppers",
    name_am: "አረንጓዴ በርበሬ",
    price: 120, unit: "kg", unit_am: "ኪሎ", emoji: "🫑",
    short_en: "Sweet, crunchy peppers full of color.",
    short_am: "ቀለምና ጣዕም ያላቸው በርበሬዎች።",
    description_en: "Crisp, sweet bell peppers loaded with vitamin C. Great raw, roasted, or in wats.",
    description_am: "በቪታሚን ሲ የበለጸጉ ጣፋጭ በርበሬዎች።",

  },
  {
    cat: "vegetables",
    name_en: "Cucumber",
    name_am: "ዱባ",
    price: 50, unit: "kg", unit_am: "ኪሎ", emoji: "🥒",
    short_en: "Cool, refreshing cucumbers.",
    short_am: "ቀዝቃዛና እርጥብ ዱባዎች።",
    description_en: "Hydrating, crisp cucumbers perfect for salads, juice, and snacking.",
    description_am: "ለሰላጣ፣ ለጁስ እና ለመክሰስ ተስማሚ ጥርሳማ ዱባዎች።",

  },
  {
    cat: "vegetables",
    name_en: "Carrots",
    name_am: "ካሮት",
    price: 45, unit: "kg", unit_am: "ኪሎ", emoji: "🥕",
    short_en: "Sweet, crunchy carrots.",
    short_am: "ጣፋጭና ጥርሳማ ካሮቶች።",
    description_en: "Fresh sweet carrots, great raw, in salads, or in hearty stews.",
    description_am: "ትኩስ ጣፋጭ ካሮቶች — ለሰላጣ እና ለወጥ ተስማሚ።",

  },
  {
    cat: "vegetables",
    name_en: "Cabbage",
    name_am: "ጥቅል ጎመን",
    price: 35, unit: "piece", unit_am: "ጥቅል", emoji: "🥬",
    short_en: "Firm, fresh cabbage heads.",
    short_am: "ጠንካራና ትኩስ ጥቅል ጎመን።",
    description_en: "Firm, fresh cabbage for shiro, salads, and everything in between.",
    description_am: "ለሽሮ፣ ለሰላጣ እና ለሌሎች ምግቦች ተስማሚ ትኩስ ጎመን።",

  },
  {
    cat: "vegetables",
    name_en: "Green Beans",
    name_am: "አደንጓሬ",
    price: 70, unit: "kg", unit_am: "ኪሎ", emoji: "🫛",
    short_en: "Tender, snappy green beans.",
    short_am: "ለስላሳና ጥርሳማ አደንጓሬ።",
    description_en: "Tender green beans perfect for steaming, stir-frying, and Ethiopian vegetable dishes.",
    description_am: "ለእንፋሎት፣ ለቅብስ እና ለአትክልት ምግቦች ተስማሚ አደንጓሬ።",

  },
  {
    cat: "vegetables",
    name_en: "Zucchini",
    name_am: "ዙኪኒ",
    price: 80, unit: "kg", unit_am: "ኪሎ", emoji: "🥒",
    short_en: "Tender summer squash.",
    short_am: "ለስላሳ የበጋ አትክልት።",
    description_en: "Mild, tender zucchini that grills and sautés beautifully.",
    description_am: "ለጥብስ እና ለቅብስ ተስማሚ ለስላሳ ዙኪኒ።",

  },
  {
    cat: "vegetables",
    name_en: "Red Onion",
    name_am: "ቀይ ሽንኩርት",
    price: 40, unit: "kg", unit_am: "ኪሎ", emoji: "🧅",
    short_en: "Sharp, aromatic red onions.",
    short_am: "ጠንካራ መዓዛ ያለው ቀይ ሽንኩርት።",
    description_en: "Pungent red onions — the soul of every Ethiopian wat.",
    description_am: "የእያንዳንዱ የኢትዮጵያ ወጥ ነፍስ የሆነው ቀይ ሽንኩርት።",

  },
  {
    cat: "fruits",
    name_en: "Avocado",
    name_am: "አቮካዶ",
    price: 85, unit: "kg", unit_am: "ኪሎ", emoji: "🥑",
    short_en: "Creamy, ripe avocados.",
    short_am: "ለስላሳና የበሰለ አቮካዶ።",
    description_en: "Creamy avocados — great in salads, on toast, or blended into the famous Ethiopian avocado juice.",
    description_am: "ለሰላጣ እና ለአቮካዶ ጁስ ተስማሚ ለስላሳ አቮካዶ።",
    featured: true,
  },
  {
    cat: "fruits",
    name_en: "Strawberries",
    name_am: "እንጆሪ",
    price: 350, unit: "box", unit_am: "ሳጥን", emoji: "🍓",
    short_en: "Sweet, ripe strawberries.",
    short_am: "ጣፋጭና የበሰለ እንጆሪ።",
    description_en: "Juicy strawberries harvested at peak ripeness. Perfect for dessert, juice, or eating fresh.",
    description_am: "በጣፋጭነቱ የተሰበሰበ እንጆሪ — ለጣፋጭ ምግቦች እና ጁስ ተስማሚ።",

  },
  // ─── Farming Materials ───
  {
    cat: "materials",
    name_en: "Hydroponic Tower Kit",
    name_am: "የሃይድሮፖኒክስ ማማ ኪት",
    price: 4500, unit: "kit", unit_am: "ኪት", emoji: "🛠️",
    short_en: "Everything you need to start growing at home.",
    short_am: "በቤት ውስጥ ለመጀመር የሚያስፈልግዎ ሁሉ።",
    description_en: "Complete 14-pocket tower with water pump, timer, net-pots and growing medium. No soil, no pesticides — just water and nutrients.",
    description_am: "የውሃ ፓምፕ፣ ታይመር፣ ኔት-ፖት እና ማደጊያ ያለው ሙሉ ባለ14-ቀዳዳ ማማ። ያለ አፈርና ፀረ-ተባይ — በውሃና ንጥረ-ምግብ ብቻ።",
    featured: true,
    meta: { brand: "Ershaye", model: "ET-14", warranty: "1 year", includes: "Tower, pump, timer, net-pots, growing medium" },
  },
  {
    cat: "materials",
    name_en: "Nutrients A & B (14L Kit)",
    name_am: "ንጥረ-ምግብ A እና B (14L)",
    price: 900, unit: "kit", unit_am: "ኪት", emoji: "🧪",
    short_en: "Complete mineral nutrition for 8 weeks of growth.",
    short_am: "ለ8 ሳምንታት እድገት ሙሉ የማዕድን አመጋገብ።",
    description_en: "Balanced two-part mineral nutrients. Mix 70mL Part A + 70mL Part B weekly for a 14L reservoir.",
    description_am: "የተመጣጠነ ባለ-ሁለት ክፍል ማዕድን ንጥረ-ምግብ። ለ14L ታንክ በሳምንት 70mL Part A + 70mL Part B ይቀላቅሉ።",
    meta: { brand: "Ershaye", format: "2 × 1L bottles", usage: "70mL Part A + 70mL Part B per week (14L tank)" },
  },
  {
    cat: "materials",
    name_en: "pH Test Kit",
    name_am: "የpH መለኪያ ኪት",
    price: 350, unit: "kit", unit_am: "ኪት", emoji: "⚗️",
    short_en: "Keep your nutrient water in the sweet spot.",
    short_am: "የንጥረ-ምግብ ውሃዎን በትክክለኛ ደረጃ ያስቀምጡ።",
    description_en: "Test strips and pH Down solution to keep your water between 5.5–6.5 — the range plants love.",
    description_am: "ውሃዎን በ5.5–6.5 መካከል ለማስቀመጥ የመለኪያ ወረቀቶች እና የpH Down ፈሳሽ።",
    meta: { brand: "pH Down", includes: "50 test strips + 250mL pH Down solution" },
  },
  // ─── eBooks ───
  {
    cat: "ebooks",
    name_en: "Hydroponics for Beginners — eBook",
    name_am: "ሃይድሮፖኒክስ ለጀማሪዎች — ኢ-መጽሐፍ",
    price: 250, unit: "download", unit_am: "ውርድ", emoji: "📘",
    short_en: "Start your soil-free farm in one weekend.",
    short_am: "በአንድ ቅዳሜና እሁድ እርሻዎን ይጀምሩ።",
    description_en: "A step-by-step digital guide covering setup, nutrients, pH, and harvesting — written for Ethiopian homes.",
    description_am: "ስለ ዝግጅት፣ ንጥረ-ምግብ፣ pH እና መሰብሰብ ደረጃ በደረጃ ዲጂታል መመሪያ — ለኢትዮጵያ ቤቶች የተዘጋጀ።",
    featured: true,
    meta: { author: "Ershaye Team", format: "PDF", pages: "64", file_url: "" },
  },
  {
    cat: "ebooks",
    name_en: "Aeroponics Master Guide — eBook",
    name_am: "የኤሮፖኒክስ ማስተር መመሪያ — ኢ-መጽሐፍ",
    price: 400, unit: "download", unit_am: "ውርድ", emoji: "📖",
    short_en: "Advanced mist-farming techniques for serious growers.",
    short_am: "ለከፍተኛ አርሶ-አደሮች የላቁ ቴክኒኮች።",
    description_en: "Go beyond the basics: 3× faster growth, 95% less water, and full system troubleshooting.",
    description_am: "ከመሰረታዊ ባሻገር፡ በ3 እጥፍ ፈጣን እድገት፣ 95% ያነሰ ውሃ እና ሙሉ የስርዓት ጥገና።",
    meta: { author: "Ershaye Team", format: "PDF", pages: "96", file_url: "" },
  },
];

const posts = [
  {
    title_en: "Why Ethiopian Cities Are Turning to Vertical Farms",
    title_am: "የኢትዮጵያ ከተሞች ለምን ወደ ቋሚ እርሻ እየተመለሱ ነው?",
    emoji: "🌿",
    content_en:
      "As Addis Ababa and other Ethiopian cities grow, farmland is getting farther away and fresh produce loses its nutrition in transit. Vertical farming changes that equation entirely.\n\nWith aeroponic towers, we grow leafy greens and herbs in the heart of the city — using 95% less water than traditional farming and no chemical pesticides. Crops go from harvest to your table in hours, not days.\n\nErshaye (እርሻዬ — 'my farm') is bringing this technology to Ethiopia, one fresh bunch at a time.",
    content_am:
      "አዲስ አበባ እና ሌሎች የኢትዮጵያ ከተሞች እያደጉ ሲሄዱ፣ የእርሻ መሬት እየራቀ ሲሄድ ትኩስ ምርት በመጓጓዣ ጊዜ ንጥረ ነገሩን ያጣል። ቋሚ እርሻ (vertical farming) ይህን ችግር ሙሉ በሙሉ ይፈታል።\n\nበአየር እርሻ ቴክኖሎጂ ቅጠላ ቅጠልን እና ቅመማ ቅመምን በከተማው እምብርት እናድጋለን — ከባህላዊ እርሻ 95% ያነሰ ውሃ በመጠቀም፣ ያለ ኬሚካል።\n\nእርሻዬ ይህን ቴክኖሎጂ ወደ ኢትዮጵያ እያመጣ ነው።",
    category: "News",
  },
  {
    title_en: "5 Greens We Grow on Our Towers — and How to Use Them",
    title_am: "በግንቦቻችን ላይ የምናደጋቸው 5 ቅጠላ ቅጠሎች",
    emoji: "🥬",
    content_en:
      "1. Green Lettuce — crisp and mild, the base of any salad.\n2. Baby Spinach — tender and sweet, perfect for smoothies.\n3. Kale (Gomen) — sturdy leaves for gomen wat and sautés.\n4. Swiss Chard — colorful stalks packed with vitamins.\n5. Arugula — peppery and bold for gourmet plates.\n\nAll of them are harvested the same day we deliver. Order before 4 PM and enjoy them at dinner.",
    content_am:
      "1. አረንጓዴ ሰላጣ — ጥርሳማና ለስላሳ፣ የማንኛውም ሰላጣ መሰረት።\n2. ቢቢ ስፒናች — ለስላሳና ጣፋጭ፣ ለጁስ ተስማሚ።\n3. ጎመን ቅጠል — ለጎመን ወጥ ተስማሚ ጠንካራ ቅጠሎች።\n4. ስዊስ ቻርድ — በቪታሚን የበለጸገ።\n5. አሩጉላ — ልዩ ጣዕም ያለው።\n\nሁሉም በምናስተላልፍበት ቀን ይሰበሰባሉ። ከቀኑ 4 ሰዓት በፊት ያዙዙ — በእራት ሰዓት ይደርስዎታል።",
    category: "Guides",
  },
];

const toSlug = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

async function main() {
  console.log("🌱 Seeding Ershaye database...");
  await initDB();

  // Categories
  for (const c of categories) {
    await pool.query(
      `INSERT INTO categories (name, name_en, name_am, description_en, description_am, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (name) DO UPDATE SET name_en=EXCLUDED.name_en, name_am=EXCLUDED.name_am,
         description_en=EXCLUDED.description_en, description_am=EXCLUDED.description_am, sort_order=EXCLUDED.sort_order`,
      [c.name, c.name_en, c.name_am, c.description_en, c.description_am, c.sort_order],
    );
  }
  console.log(`✅ ${categories.length} categories`);

  // Products
  const catMap = new Map(
    (await pool.query("SELECT id, name FROM categories")).rows.map((r) => [r.name, r.id]),
  );
  let count = 0;
  for (const p of products) {
    const slug = toSlug(p.name_en) + "-" + p.name_en.length;
    await pool.query(
      `INSERT INTO products (name_en, name_am, slug, category_id, price, unit, unit_am,
         image, short_en, short_am, description_en, description_am, featured, available, stock, meta)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, TRUE, 50, $14)
       ON CONFLICT (slug) DO UPDATE SET price=EXCLUDED.price, image=EXCLUDED.image,
         short_en=EXCLUDED.short_en, short_am=EXCLUDED.short_am, available=TRUE, meta=EXCLUDED.meta`,
      [p.name_en, p.name_am, slug, catMap.get(p.cat), p.price, p.unit, p.unit_am,
        makeImage(p.emoji, p.name_en), p.short_en, p.short_am, p.description_en, p.description_am,
        p.featured || false, p.meta || {}],
    );
    count++;
  }
  console.log(`✅ ${count} products`);

  // Admin accounts
  const admins = [
    { email: "admin@admin.com", password: "123456", role: "superadmin" },
    { email: "admin@ershaye.et", password: "Ershaye2026!", role: "admin" },
  ];
  for (const a of admins) {
    const hash = await bcrypt.hash(a.password, 10);
    await pool.query(
      `INSERT INTO admins (email, password_hash, role) VALUES ($1, $2, $3)
       ON CONFLICT (email) DO NOTHING`,
      [a.email, hash, a.role],
    );
  }
  console.log(
    `✅ Admins: ${admins.map((a) => `${a.email} / ${a.password}`).join(", ")}`,
  );

  // Posts (replace-by-title so re-running the seed never duplicates)
  await pool.query("DELETE FROM posts WHERE title_en = ANY($1)", [posts.map((p) => p.title_en)]);
  for (const post of posts) {
    await pool.query(
      `INSERT INTO posts (title_en, title_am, content_en, content_am, author, category, image, published)
       VALUES ($1, $2, $3, $4, 'Ershaye', $5, $6, TRUE)`,
      [post.title_en, post.title_am, post.content_en, post.content_am, post.category,
        makeImage(post.emoji || "📰", post.title_en)],
    );
  }
  console.log(`✅ ${posts.length} blog posts`);

  // Settings (business details + shop config)
  const settings = [
    ["shop_open", "true"],
    ["delivery_fee", "150"],
    ["business_name", "Ershaye Trading PLC"],
    ["business_phone", "+251 951 469565"],
    ["business_phone_alt", "+251 940 124409"],
    ["business_email", "hello@ershaye.et"],
    ["business_address", "Addis Ababa, Ethiopia"],
    ["telegram_url", "https://t.me/ershaye"],
    ["instagram_url", "https://www.instagram.com/ershayee"],
    ["facebook_url", "https://www.facebook.com/Ershaye"],
    ["bank_name", "Commercial Bank of Ethiopia (CBE)"],
    ["bank_account", "1000 1847 2659 3312"],
    ["bank_holder", "Ershaye Trading PLC"],
  ];
  for (const [key, value] of settings) {
    await pool.query(
      `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
      [key, value],
    );
  }
  console.log(`✅ ${settings.length} settings (business details + shop config)`);

  console.log("🎉 Seeding complete!");
  await pool.end();
}

main().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});

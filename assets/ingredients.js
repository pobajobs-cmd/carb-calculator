// Ingredient reader for the carb calculator's "import from a link" feature.
//
// 1. Works out a weight in grams from a recipe line ("200g/7oz plain flour", "2 ripe bananas",
//    "1 x 400g tin chopped tomatoes", "3 tbsp honey", "1½ cups milk").
// 2. Matches it to a list of common ingredients with typical carbs per 100g.
//
// The carb figures are typical UK values (available carbohydrate, as on UK packet labels) and are
// a starting point only — brands vary. Every imported line can be checked and edited on the page.
// To add or correct an ingredient, edit the INGREDIENTS list below.
//
// Each entry: [ ['names', 'to match'], carbs per 100g, { options } ]
//   each:  grams for one item (e.g. one banana)      cup:  grams in one US cup
//   tbsp:  grams in one tablespoon                   ml:   grams per ml (density), default 1
//   vary:  true if carbs vary a lot between brands   tin:  grams in a standard tin/can

const INGREDIENTS = [
  // ---- Flours, starches, baking ----
  [['plain flour', 'all-purpose flour', 'all purpose flour', 'white flour', 'flour', 'cake flour', 'pastry flour'], 77, { cup: 125, tbsp: 8 }],
  [['self-raising flour', 'self raising flour', 'self-rising flour', 'self rising flour'], 73, { cup: 125, tbsp: 8 }],
  [['strong white flour', 'bread flour', 'strong flour'], 72, { cup: 130, tbsp: 8 }],
  [['wholemeal flour', 'whole wheat flour', 'wholewheat flour', 'spelt flour'], 63, { cup: 120, tbsp: 8 }],
  [['cornflour', 'cornstarch', 'corn starch', 'corn flour'], 88, { cup: 128, tbsp: 8 }],
  [['almond flour', 'ground almonds', 'almond meal'], 5, { cup: 96, tbsp: 6 }],
  [['coconut flour'], 22, { cup: 112, tbsp: 7, vary: true }],
  [['baking powder'], 28, { tbsp: 12 }],
  [['bicarbonate of soda', 'bicarb', 'baking soda'], 0, { tbsp: 14 }],
  [['yeast', 'dried yeast', 'fast-action yeast'], 10, { tbsp: 9 }],
  [['cocoa powder', 'cocoa'], 11, { cup: 85, tbsp: 6 }],
  [['vanilla extract', 'vanilla essence', 'vanilla'], 13, { tbsp: 13 }],
  [['gelatine', 'gelatin'], 0, {}],

  // ---- Sugars and sweet things ----
  [['caster sugar', 'granulated sugar', 'white sugar', 'sugar', 'superfine sugar'], 100, { cup: 200, tbsp: 12.5 }],
  [['light brown sugar', 'dark brown sugar', 'soft brown sugar', 'brown sugar', 'muscovado', 'demerara'], 97, { cup: 220, tbsp: 13 }],
  [['icing sugar', 'powdered sugar', "confectioners' sugar", 'confectioners sugar'], 100, { cup: 120, tbsp: 8 }],
  [['honey'], 82, { cup: 340, tbsp: 21, ml: 1.42 }],
  [['maple syrup'], 67, { cup: 315, tbsp: 20, ml: 1.32 }],
  [['golden syrup', 'corn syrup'], 78, { cup: 330, tbsp: 21, ml: 1.38 }],
  [['agave'], 76, { tbsp: 21, ml: 1.37 }],
  [['jam', 'jelly', 'preserve', 'marmalade'], 60, { tbsp: 20 }],
  [['chocolate spread', 'nutella'], 57, { tbsp: 19 }],
  [['milk chocolate'], 57, { cup: 170 }],
  [['dark chocolate', 'plain chocolate', 'bittersweet chocolate', 'semisweet chocolate', 'semi-sweet chocolate'], 38, { cup: 170, vary: true }],
  [['white chocolate'], 58, { cup: 170 }],
  [['chocolate chips', 'choc chips', 'chocolate chunks'], 60, { cup: 170, tbsp: 11, vary: true }],
  [['chocolate'], 50, { cup: 170, vary: true }],
  [['condensed milk'], 55, { tbsp: 20, tin: 397, ml: 1.3 }],
  [['marshmallows', 'marshmallow'], 80, { cup: 50, each: 7 }],

  // ---- Grains, pasta, bread ----
  [['porridge oats', 'rolled oats', 'oats', 'oatmeal', 'jumbo oats'], 60, { cup: 90, tbsp: 6 }],
  [['cooked rice', 'leftover rice', 'boiled rice', 'microwave rice', 'pouch rice'], 30, { cup: 160 }],
  [['brown rice'], 73, { cup: 190, vary: true }],
  [['arborio rice', 'risotto rice', 'basmati rice', 'jasmine rice', 'long grain rice', 'white rice', 'pudding rice', 'paella rice', 'rice'], 79, { cup: 185, tbsp: 12 }],
  [['cooked pasta'], 30, { cup: 140 }],
  [['spaghetti', 'pasta', 'penne', 'fusilli', 'linguine', 'tagliatelle', 'macaroni', 'farfalle', 'rigatoni', 'orzo', 'lasagne sheets', 'lasagna sheets', 'lasagne', 'conchiglie', 'pappardelle'], 72, { cup: 100 }],
  [['fresh pasta', 'fresh lasagne', 'fresh tagliatelle'], 50, {}],
  [['egg noodles'], 70, { each: 63 }],
  [['rice noodles'], 80, {}],
  [['noodles', 'udon', 'soba'], 70, { vary: true }],
  [['couscous'], 72, { cup: 175 }],
  [['quinoa'], 57, { cup: 170 }],
  [['bulgur wheat', 'bulgur', 'bulghur'], 69, { cup: 140 }],
  [['polenta', 'cornmeal'], 75, { cup: 160 }],
  [['gnocchi'], 32, {}],
  [['breadcrumbs', 'panko', 'bread crumbs'], 72, { cup: 110, tbsp: 7 }],
  [['wholemeal bread', 'brown bread', 'granary bread'], 40, { each: 36, vary: true }],
  [['bread', 'white bread', 'sourdough', 'loaf', 'baguette', 'ciabatta'], 46, { each: 36, vary: true }],
  [['tortilla wraps', 'tortillas', 'tortilla', 'wraps', 'flour tortilla'], 50, { each: 62, vary: true }],
  [['pitta', 'pita'], 50, { each: 60 }],
  [['naan'], 48, { each: 130, vary: true }],
  [['burger buns', 'burger bun', 'brioche buns', 'bread rolls', 'roll', 'bun'], 47, { each: 60, vary: true }],
  [['crumpets', 'crumpet'], 38, { each: 55 }],
  [['english muffins', 'english muffin'], 44, { each: 65 }],
  [['puff pastry'], 35, { vary: true }],
  [['shortcrust pastry', 'pastry'], 47, { vary: true }],
  [['filo pastry', 'filo', 'phyllo'], 55, { each: 25 }],
  [['digestive biscuits', 'digestives', 'graham crackers'], 63, { each: 15 }],
  [['biscuits', 'cookies'], 65, { each: 12, vary: true }],
  [['cornflakes', 'corn flakes'], 84, { cup: 28 }],
  [['rice krispies', 'rice crispies', 'puffed rice'], 87, { cup: 28 }],
  [['crackers', 'cream crackers'], 68, { each: 8 }],
  [['tortilla chips', 'nachos'], 60, {}],
  [['oven chips', 'frozen chips', 'french fries', 'fries'], 23, { vary: true }],

  // ---- Dairy and eggs ----
  [['whole milk', 'semi-skimmed milk', 'semi skimmed milk', 'skimmed milk', 'milk', '2% milk', 'full fat milk', 'full-fat milk'], 4.7, { cup: 245, tbsp: 15, ml: 1.03 }],
  [['buttermilk'], 4.8, { cup: 245, ml: 1.03 }],
  [['evaporated milk'], 11, { tin: 410, ml: 1.07 }],
  [['oat milk', 'oat drink'], 6.5, { cup: 240, vary: true }],
  [['almond milk', 'almond drink'], 0.5, { cup: 240, vary: true }],
  [['soya milk', 'soy milk', 'soya drink'], 1.5, { cup: 240, vary: true }],
  [['coconut milk'], 3, { cup: 240, tin: 400 }],
  [['coconut cream'], 4, { tin: 160 }],
  [['double cream', 'heavy cream', 'whipping cream', 'single cream', 'cream', 'light cream', 'clotted cream'], 3, { cup: 240, tbsp: 15 }],
  [['sour cream', 'soured cream', 'creme fraiche', 'crème fraîche'], 4, { cup: 230, tbsp: 15 }],
  [['ice cream'], 24, { cup: 130, vary: true }],
  [['greek yoghurt', 'greek yogurt', 'greek-style yoghurt', 'greek-style yogurt'], 4, { cup: 245, tbsp: 15 }],
  [['natural yoghurt', 'natural yogurt', 'plain yoghurt', 'plain yogurt', 'yoghurt', 'yogurt'], 6, { cup: 245, tbsp: 15, vary: true }],
  [['butter', 'unsalted butter', 'salted butter'], 0.6, { cup: 227, tbsp: 14, each: 250 }],
  [['margarine', 'baking spread', 'stork'], 0.5, { tbsp: 14 }],
  [['cream cheese', 'soft cheese', 'philadelphia', 'mascarpone'], 4, { cup: 230, tbsp: 15 }],
  [['ricotta'], 3, { cup: 250 }],
  [['cottage cheese'], 3.5, { cup: 225 }],
  [['cheddar', 'cheese', 'mature cheddar', 'gruyere', 'gruyère', 'red leicester', 'emmental', 'edam', 'gouda'], 0.1, { cup: 100, tbsp: 7 }],
  [['parmesan', 'parmigiano', 'pecorino', 'grana padano'], 0, { cup: 90, tbsp: 5 }],
  [['mozzarella', 'halloumi', 'feta', 'goat\'s cheese', 'goats cheese', 'brie', 'camembert'], 1.5, { cup: 110, each: 125 }],
  [['eggs', 'egg', 'large eggs', 'medium eggs', 'free-range eggs', 'egg yolks', 'egg yolk', 'egg whites', 'egg white'], 0.2, { each: 50 }],

  // ---- Fruit ----
  [['bananas', 'banana'], 20, { each: 115, cup: 225 }],
  [['apples', 'apple', 'eating apple', 'bramley'], 11.6, { each: 150, cup: 125 }],
  [['pears', 'pear'], 10, { each: 160 }],
  [['oranges', 'orange'], 8.5, { each: 160 }],
  [['orange juice'], 9, { cup: 248, ml: 1.04 }],
  [['apple juice'], 10, { cup: 248, ml: 1.04 }],
  [['lemon juice', 'lime juice', 'juice of'], 2, { tbsp: 15 }],
  [['lemons', 'lemon', 'limes', 'lime'], 3, { each: 60 }],
  [['lemon zest', 'lime zest', 'orange zest', 'zest'], 5, { tbsp: 6 }],
  [['strawberries', 'strawberry'], 6, { cup: 150, each: 12 }],
  [['raspberries', 'raspberry'], 4.6, { cup: 125 }],
  [['blueberries', 'blueberry'], 10, { cup: 148, vary: true }],
  [['blackberries', 'blackberry'], 5, { cup: 144 }],
  [['mixed berries', 'frozen berries', 'summer fruits', 'berries'], 7, { cup: 150, vary: true }],
  [['cherries', 'cherry'], 11.5, { cup: 155 }],
  [['grapes', 'grape'], 15, { cup: 150 }],
  [['mango'], 13.5, { each: 200, cup: 165 }],
  [['pineapple'], 10, { cup: 165, tin: 260 }],
  [['peaches', 'peach', 'nectarines', 'nectarine'], 7.6, { each: 150 }],
  [['plums', 'plum'], 8.8, { each: 65 }],
  [['kiwi'], 10.6, { each: 70 }],
  [['melon', 'watermelon'], 7, { cup: 155 }],
  [['avocados', 'avocado'], 1.9, { each: 140 }],
  [['raisins', 'sultanas', 'currants', 'dried fruit', 'mixed fruit'], 69, { cup: 150, tbsp: 10 }],
  [['dates', 'medjool dates'], 66, { each: 20, cup: 150 }],
  [['dried apricots'], 37, { each: 8, cup: 130 }],
  [['desiccated coconut', 'shredded coconut'], 6.4, { cup: 80, tbsp: 5 }],

  // ---- Vegetables ----
  [['potatoes', 'potato', 'new potatoes', 'baby potatoes', 'maris piper', 'king edward', 'baking potato', 'jacket potato'], 16, { each: 175, cup: 150 }],
  [['sweet potatoes', 'sweet potato'], 20, { each: 200, cup: 135 }],
  [['carrots', 'carrot'], 7, { each: 80, cup: 128 }],
  [['parsnips', 'parsnip'], 12.5, { each: 130 }],
  [['onions', 'onion', 'red onion', 'brown onion', 'white onion', 'shallots', 'shallot'], 8, { each: 150, cup: 160 }],
  [['spring onions', 'spring onion', 'scallions', 'scallion', 'green onions'], 3, { each: 15 }],
  [['leeks', 'leek'], 3, { each: 150 }],
  [['garlic cloves', 'garlic clove', 'cloves garlic', 'garlic'], 16, { each: 5, tbsp: 9 }],
  [['ginger'], 8, { tbsp: 6 }],
  [['red pepper', 'green pepper', 'yellow pepper', 'bell pepper', 'peppers', 'pepper', 'capsicum'], 5, { each: 160 }],
  [['chillies', 'chilli', 'chili', 'chilies', 'jalapeno', 'jalapeño'], 4, { each: 10 }],
  [['tomatoes', 'tomato', 'cherry tomatoes', 'plum tomatoes', 'vine tomatoes'], 3.1, { each: 85, cup: 180 }],
  [['chopped tomatoes', 'tinned tomatoes', 'canned tomatoes', 'plum tomatoes in juice', 'crushed tomatoes', 'diced tomatoes'], 3.5, { tin: 400, cup: 240 }],
  [['passata', 'tomato sauce', 'pasta sauce'], 5, { cup: 245, tbsp: 15, vary: true }],
  [['tomato puree', 'tomato purée', 'tomato paste'], 13, { tbsp: 16 }],
  [['sun-dried tomatoes', 'sundried tomatoes'], 25, { tbsp: 8, vary: true }],
  [['mushrooms', 'mushroom', 'chestnut mushrooms'], 0.4, { each: 18, cup: 70 }],
  [['courgettes', 'courgette', 'zucchini'], 1.8, { each: 200 }],
  [['aubergines', 'aubergine', 'eggplant'], 2.5, { each: 300 }],
  [['broccoli'], 2, { cup: 90, each: 350 }],
  [['cauliflower'], 3, { cup: 105, each: 600 }],
  [['spinach', 'baby spinach', 'kale', 'rocket', 'arugula', 'lettuce', 'salad leaves', 'watercress', 'cabbage', 'pak choi', 'bok choy'], 1.5, { cup: 30, vary: true }],
  [['celery'], 0.9, { each: 40 }],
  [['cucumber'], 1.5, { each: 300 }],
  [['frozen peas', 'garden peas', 'petits pois', 'peas'], 9, { cup: 145, tbsp: 10 }],
  [['sweetcorn', 'corn kernels', 'corn'], 14, { cup: 165, tin: 198, vary: true }],
  [['corn on the cob', 'corn cobs', 'corn cob'], 13, { each: 150 }],
  [['green beans', 'runner beans', 'fine beans', 'mangetout', 'sugar snap peas', 'asparagus'], 3, { cup: 110 }],
  [['butternut squash', 'squash', 'pumpkin'], 8.5, { cup: 140, each: 900 }],
  [['beetroot'], 7.5, { each: 80 }],

  // ---- Beans, pulses, nuts ----
  [['baked beans'], 13, { tin: 415 }],
  [['kidney beans', 'black beans', 'cannellini beans', 'haricot beans', 'pinto beans', 'borlotti beans', 'mixed beans', 'beans'], 13, { tin: 240, cup: 175, vary: true }],
  [['butter beans'], 10, { tin: 240 }],
  [['chickpeas', 'chick peas', 'garbanzo beans'], 14, { tin: 240, cup: 165 }],
  [['red lentils', 'green lentils', 'puy lentils', 'brown lentils', 'lentils'], 49, { cup: 190, tin: 265, vary: true }],
  [['peanut butter', 'almond butter', 'nut butter'], 12, { tbsp: 16, vary: true }],
  [['peanuts', 'almonds', 'cashews', 'walnuts', 'pecans', 'hazelnuts', 'pistachios', 'nuts', 'mixed nuts', 'pine nuts', 'flaked almonds'], 10, { cup: 140, tbsp: 9, vary: true }],
  [['chia seeds', 'flaxseed', 'linseed', 'sesame seeds', 'sunflower seeds', 'pumpkin seeds', 'seeds'], 5, { tbsp: 10, vary: true }],

  // ---- Meat, fish, protein (essentially no carbs) ----
  [['chicken', 'chicken breast', 'chicken breasts', 'chicken thighs', 'chicken thigh', 'turkey', 'beef', 'mince', 'minced beef', 'steak', 'pork', 'lamb', 'bacon', 'pancetta', 'chorizo', 'ham', 'prosciutto', 'salmon', 'cod', 'haddock', 'tuna', 'prawns', 'shrimp', 'fish', 'fillet', 'fillets', 'duck', 'venison', 'gammon', 'salami', 'anchovies', 'mackerel'], 0, { each: 150 }],
  [['sausages', 'sausage', 'chipolatas'], 9, { each: 60, vary: true }],
  [['tofu'], 1.5, {}],
  [['quorn', 'meat-free mince'], 4.5, { vary: true }],

  // ---- Oils, sauces, stocks, condiments ----
  [['olive oil', 'vegetable oil', 'sunflower oil', 'rapeseed oil', 'coconut oil', 'sesame oil', 'groundnut oil', 'oil', 'cooking spray', 'frylight'], 0, { tbsp: 14, cup: 220, ml: 0.92 }],
  [['lard', 'ghee', 'dripping'], 0, { tbsp: 13 }],
  [['chicken stock', 'vegetable stock', 'veg stock', 'beef stock', 'fish stock', 'lamb stock', 'chicken broth', 'vegetable broth', 'beef broth', 'stock', 'broth', 'stock cube', 'stock cubes', 'stock pot', 'bouillon', 'gravy granules'], 1, { each: 10, cup: 240, vary: true }],
  [['water', 'boiling water', 'cold water', 'warm water', 'ice'], 0, { cup: 240, tbsp: 15 }],
  [['soy sauce', 'soya sauce', 'tamari'], 7, { tbsp: 16, vary: true }],
  [['worcestershire sauce'], 19, { tbsp: 17 }],
  [['fish sauce'], 3.6, { tbsp: 18 }],
  [['oyster sauce', 'hoisin sauce', 'hoisin', 'teriyaki', 'sweet chilli sauce', 'bbq sauce', 'barbecue sauce', 'brown sauce'], 40, { tbsp: 18, vary: true }],
  [['tomato ketchup', 'ketchup'], 23, { tbsp: 17 }],
  [['mayonnaise', 'mayo'], 1.5, { tbsp: 14 }],
  [['mustard', 'dijon', 'wholegrain mustard'], 5, { tbsp: 15 }],
  [['balsamic vinegar', 'balsamic'], 17, { tbsp: 16 }],
  [['vinegar', 'white wine vinegar', 'red wine vinegar', 'cider vinegar', 'rice vinegar'], 1, { tbsp: 15 }],
  [['pesto'], 4, { tbsp: 15, vary: true }],
  [['curry paste', 'tikka paste', 'thai curry paste', 'harissa'], 10, { tbsp: 15, vary: true }],
  [['red wine', 'white wine', 'wine'], 3, { cup: 240 }],
  [['beer', 'ale', 'stout', 'cider'], 3.5, { cup: 240, vary: true }],
  [['gravy'], 5, { cup: 240, vary: true }],
  [['hummus', 'houmous'], 12, { tbsp: 15, vary: true }],
  [['salsa'], 6, { tbsp: 16, vary: true }],

  // ---- Herbs, spices, seasoning (tiny amounts) ----
  [['salt', 'sea salt', 'black pepper', 'pepper to taste', 'salt and pepper', 'seasoning'], 0, { tbsp: 18 }],
  [['cinnamon', 'nutmeg', 'mixed spice', 'paprika', 'smoked paprika', 'cumin', 'coriander seeds', 'ground coriander', 'turmeric', 'chilli powder', 'chili powder', 'chilli flakes', 'garam masala', 'curry powder', 'oregano', 'dried herbs', 'mixed herbs', 'thyme', 'rosemary', 'bay leaves', 'bay leaf', 'cayenne', 'allspice', 'cloves', 'cardamom', 'five spice', 'italian seasoning', 'spice', 'spices'], 30, { tbsp: 7, each: 1 }],
  [['basil', 'parsley', 'coriander', 'cilantro', 'mint', 'dill', 'chives', 'fresh herbs', 'sage', 'tarragon'], 2, { tbsp: 3, each: 1 }],
];

// ---- Build a lookup: every name, longest first, so "sweet potato" beats "potato" ----
const INGREDIENT_INDEX = [];
INGREDIENTS.forEach(([names, per100, opts]) => {
  names.forEach(n => INGREDIENT_INDEX.push({ key: n.toLowerCase(), entry: { name: names[0], per100, ...opts } }));
});
INGREDIENT_INDEX.sort((a, b) => b.key.length - a.key.length);
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
INGREDIENT_INDEX.forEach(i => { i.re = new RegExp('(^|[^a-z])' + escRe(i.key) + '(e?s)?(?![a-z])'); });

function matchIngredient(text) {
  const t = text.toLowerCase().replace(/[’']/g, "'");
  for (const i of INGREDIENT_INDEX) if (i.re.test(t)) return i.entry;
  return null;
}

// ---- Quantities ----
const FRACTIONS = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875, '⅕': 0.2 };

function normalise(line) {
  return String(line)
    .replace(/(\d)([½¼¾⅓⅔⅛⅜⅝⅞⅕])/g, '$1 $2')
    .replace(/[½¼¾⅓⅔⅛⅜⅝⅞⅕]/g, (m) => ' ' + FRACTIONS[m] + ' ')
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/–|—/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

// Reads a number at the start: "2", "1.5", "1 1/2", "1/2", "2-3", "2 to 3"
function leadingQty(s) {
  const num = /^(\d+(?:\.\d+)?)(?:\s+(\d+(?:\.\d+)?)(?!\s*\/))?(?:\s*(\d+)\s*\/\s*(\d+))?/;
  const frac = /^(\d+)\s*\/\s*(\d+)/;
  let m, value = null, rest = s;
  if ((m = rest.match(frac))) { value = +m[1] / +m[2]; rest = rest.slice(m[0].length); }
  else if ((m = rest.match(num))) {
    value = parseFloat(m[1]) + (m[2] && parseFloat(m[2]) < 1 ? parseFloat(m[2]) : 0) + (m[3] ? +m[3] / +m[4] : 0);
    rest = rest.slice(m[0].length);
    if (m[2] && parseFloat(m[2]) >= 1) rest = m[2] + rest; // "2 400g tins" — second number belongs to what follows
  }
  if (value === null) return null;
  const range = rest.match(/^\s*(?:-|to)\s*(\d+(?:\.\d+)?)(?:\s+(0\.\d+))?/);
  if (range) { value = (value + parseFloat(range[1]) + (range[2] ? parseFloat(range[2]) : 0)) / 2; rest = rest.slice(range[0].length); }
  return { value, rest: rest.trim() };
}

const MASS_UNITS = [
  [/^(kg|kilos?|kilograms?)\b/, 1000, 'mass'],
  [/^(g|gr|grams?|gm)\b/, 1, 'mass'],
  [/^(mg)\b/, 0.001, 'mass'],
  [/^(oz|ounces?)\b/, 28.35, 'mass'],
  [/^(lbs?|pounds?)\b/, 453.6, 'mass'],
  [/^(ml|millilitres?|milliliters?|mls)\b/, 1, 'vol'],
  [/^(cl)\b/, 10, 'vol'],
  [/^(l|litres?|liters?|ltr)\b/, 1000, 'vol'],
  [/^(fl\.? ?oz|fluid ounces?)\b/, 28.4, 'vol'],
  [/^(pints?)\b/, 568, 'vol'],
];
const SPOON_UNITS = [
  [/^(tbsps?|tbs|tbl|tablespoons?|tblsp)\b\.?/, 'tbsp', 1],
  [/^(heaped tbsps?|heaped tablespoons?)\b/, 'tbsp', 1.3],
  [/^(level tbsps?|level tablespoons?)\b/, 'tbsp', 1],
  [/^(tsps?|teaspoons?|t)\b\.?/, 'tbsp', 1 / 3],
  [/^(heaped tsps?|heaped teaspoons?)\b/, 'tbsp', 0.45],
  [/^(cups?|c)\b\.?/, 'cup', 1],
  [/^(mugs?)\b/, 'cup', 1.1],
  [/^(dessertspoons?|dsp)\b/, 'tbsp', 2 / 3],
];
const OTHER_UNITS = [
  [/^(tins?|cans?)\b/, 'tin'],
  [/^(cloves?)\b/, 'each'],
  [/^(slices?|rashers?|sheets?|pieces?|fillets?|breasts?|thighs?|sticks?|stalks?|heads?|bulbs?|cobs?|whole|large|medium|small|ripe|big)\b/, 'each'],
  [/^(pinch(es)?|dash(es)?|sprinkles?|grinds?)\b/, 'pinch'],
  [/^(handfuls?)\b/, 'handful'],
  [/^(knobs?)\b/, 'knob'],
  [/^(splash(es)?|drizzles?|glugs?)\b/, 'splash'],
  [/^(bunch(es)?|sprigs?|small bunch)\b/, 'bunch'],
  [/^(packs?|packets?|bags?|tubs?|pots?|jars?|cartons?|punnets?|blocks?)\b/, 'pack'],
];

// Turns one recipe line into { name, grams, per100, status, note, line }
//   status: 'ok'    weight given in grams/ml and ingredient recognised
//           'est'   recognised, but weight estimated from cups/spoons/counts — worth a glance
//           'check' couldn't work out the weight or the ingredient — needs filling in
function parseIngredientLine(raw) {
  const line = String(raw).trim();
  const s = normalise(line.replace(/\([^)]*\)/g, (m) => /\d\s*(g|kg|ml|oz|lb)\b/i.test(m) ? ' ' + m.slice(1, -1) + ' ' : ' ')).toLowerCase();
  const entry = matchIngredient(line);
  const optional = /\b(to serve|for serving|to garnish|for garnish|optional|for dusting|for greasing|to decorate)\b/i.test(line) && !/plus (extra|more)/i.test(line);

  let grams = null, how = '';
  const q = leadingQty(s.replace(/^(about|approx\.?|approximately|around|roughly|a little|plus)\s+/, ''));
  let rest = q ? q.rest : s;

  // 1) A weight or volume straight after the number: "200g", "1.5kg", "250 ml", "200g/7oz"
  if (q) {
    for (const [re, mult, kind] of MASS_UNITS) {
      const m = rest.match(re);
      if (m) {
        grams = q.value * mult * (kind === 'vol' ? (entry && entry.ml) || 1 : 1);
        how = kind === 'vol' ? 'ml' : 'g';
        break;
      }
    }
  }
  // 2) "2 x 400g tins", "1 (400g) can", "a 400g tin"
  if (grams === null) {
    const inner = s.match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|l)\b/);
    if (inner) {
      const mult = { kg: 1000, g: 1, ml: (entry && entry.ml) || 1, l: 1000 * ((entry && entry.ml) || 1) }[inner[2]];
      const count = q && !s.startsWith(inner[0]) && parseFloat(inner[1]) !== q.value ? q.value : 1;
      grams = count * parseFloat(inner[1]) * mult;
      how = 'g';
    }
  }
  // 2b) "juice of 1 lemon", "zest and juice of 2 limes"
  if (grams === null) {
    const j = s.match(/juice (?:of|from) (\d+(?:\.\d+)?|an?|one|half)?\s*(?:a\s+)?(lemons?|limes?|oranges?)/);
    if (j) {
      const n = j[1] === 'half' ? 0.5 : /^\d/.test(j[1] || '') ? parseFloat(j[1]) : 1;
      grams = n * ({ l: 40, o: 80 }[j[2][0]] || 30) * (j[2].startsWith('lime') ? 0.75 : 1);
      how = 'each';
    }
  }
  // 3) Spoons and cups
  if (grams === null && q) {
    const rr = rest.replace(/^(level|heaped|rounded|generous)\s+/, (m) => m);
    for (const [re, kind, factor] of SPOON_UNITS) {
      if (re.test(rr)) {
        const base = kind === 'cup' ? (entry && entry.cup) || 240 : (entry && entry.tbsp) || 15;
        grams = q.value * base * factor; how = kind; break;
      }
    }
  }
  // 4) Tins, items, pinches...
  if (grams === null) {
    const rr = rest.replace(/^(a|an|one)\s+/, '');
    let unit = null;
    for (const [re, kind] of OTHER_UNITS) if (re.test(rr)) { unit = kind; break; }
    const count = q ? q.value : (/^(a|an|one)\b/.test(rest) || ['pinch', 'handful', 'knob', 'splash', 'bunch'].includes(unit) ? 1 : null);
    if (count !== null) {
      if (unit === 'tin' && entry && entry.tin) { grams = count * entry.tin; how = 'tin'; }
      else if (unit === 'tin') { grams = count * 400; how = 'tin'; }
      else if (unit === 'pinch') { grams = count * 0.5; how = 'pinch'; }
      else if (unit === 'handful') { grams = count * 30; how = 'handful'; }
      else if (unit === 'knob') { grams = count * 10; how = 'knob'; }
      else if (unit === 'splash') { grams = count * 10; how = 'splash'; }
      else if (unit === 'bunch') { grams = count * 25; how = 'bunch'; }
      else if (unit === 'pack') { grams = null; how = 'pack'; }
      else if (entry && entry.each) { grams = count * entry.each; how = 'each'; }
    }
  }

  // Ingredients with no carbs don't need a weight to be right
  const zeroCarb = entry && entry.per100 === 0;
  let status;
  if (!entry) status = 'check';
  else if (grams === null) status = zeroCarb ? 'ok' : 'check';
  else status = (how === 'g' || how === 'ml') && !entry.vary ? 'ok' : 'est';
  if (optional && status === 'ok' && !zeroCarb) status = 'est';

  const notes = [];
  if (!entry) notes.push('ingredient not recognised — add carbs per 100g');
  else if (grams === null && !zeroCarb) notes.push('couldn’t work out the weight');
  else if (how && !['g', 'ml'].includes(how)) notes.push('weight estimated from ' + ({ cup: 'cups', tbsp: 'spoons', each: 'a typical size', tin: 'a standard tin', pinch: 'a pinch', handful: 'a handful', knob: 'a knob', splash: 'a splash', bunch: 'a bunch' }[how] || how));
  if (entry && entry.vary && entry.per100 > 0) notes.push('carbs vary by brand — check the packet');
  if (optional) notes.push('listed as optional / to serve');

  return {
    line,
    name: tidyName(line),
    grams: grams === null ? null : Math.round(grams * 10) / 10,
    per100: entry ? entry.per100 : null,
    matched: entry ? entry.name : null,
    status,
    note: notes.join(' · '),
  };
}

function tidyName(line) {
  let n = normalise(line)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/^[\d\s./-]+(?:x\s*)?/i, '')
    .replace(/^(\d+(\.\d+)?\s*)?(kg|g|gr|grams?|ml|l|litres?|oz|lb|lbs|tbsps?|tbsp\.|tablespoons?|tsps?|teaspoons?|cups?|fl ?oz)\b\.?\s*/i, '')
    .replace(/^\/\s*[\d.\s]+(oz|fl ?oz|lb|lbs|cups?|pints?)\b\s*/i, '')
    .replace(/^(an?\s+)/i, '')
    .replace(/^((x|tins?|cans?|packs?|packets?|bags?|jars?|large|medium|small|big|ripe|whole|heaped|level|slices?|rashers?|pinch(es)?|handfuls?|knobs?|splash(es)?|dash(es)?|bunch(es)?|sprigs?)\s+)+/i, '')
    .replace(/^(of\s+)/i, '')
    .replace(/\s+/g, ' ').trim();
  n = n.split(/,\s*/)[0] || n;
  n = n.charAt(0).toUpperCase() + n.slice(1);
  return n.length > 60 ? n.slice(0, 57) + '…' : n;
}

if (typeof module !== 'undefined') module.exports = { parseIngredientLine, matchIngredient, INGREDIENTS };

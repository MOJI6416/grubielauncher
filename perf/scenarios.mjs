const sidebar = (page) => page.locator("aside");
const navButton = (page, name) => sidebar(page).getByRole("button", { name, exact: true }).first();
const tab = (page, name) => page.getByRole("tab", { name }).first();
const main = (page) => page.locator("main");

const noSkeleton = { within: "main", absent: ".animate-pulse" };
const text = (value) => ({ ...noSkeleton, text: value });

export const instanceName = "Prominence II";
export const heavyInstanceName = "Mega Pack";

async function goHome(page) {
  await navButton(page, "Play").click();
  await page.waitForSelector("[data-home-hero]", { timeout: 15000 });
}

async function openInstance(page, name) {
  await sidebar(page).getByRole("button", { name: new RegExp(`^${name.replace(/[+]/g, "\\+")}\\b`) }).first().click();
}

function step(id, title, act, ready, extra = {}) {
  return { id, title, act, ready, ...extra };
}

export function tour() {
  return [
    step("home.search", "Главная: поиск сборок (ввод)", async (page) => {
      await main(page).getByPlaceholder(/Search instances/).click();
      await page.keyboard.type("pix", { delay: 90 });
    }, text("Pixelmon"), { kind: "typing" }),
    step("home.searchClear", "Главная: сброс поиска", async (page) => {
      await page.keyboard.press("Control+A");
      await page.keyboard.press("Backspace");
    }, text("COBBLEVERSE")),
    step("palette.open", "Палитра Ctrl+K: открытие", (page) => page.keyboard.press("Control+K"), { selector: "[role=dialog] input" }),
    step("palette.type", "Палитра: ввод запроса", (page) => page.keyboard.type("set", { delay: 90 }), { selector: "[role=dialog] [role=option]" }, { kind: "typing" }),
    step("palette.close", "Палитра: закрытие", (page) => page.keyboard.press("Escape"), { absent: "[role=dialog]" }),
    step("nav.people", "Люди", (page) => navButton(page, /^People/).click(), text("Nightshade")),
    step("people.chat", "Люди: открыть чат", (page) => main(page).getByText("Pixelwolf", { exact: true }).first().click(), { within: "main", selector: "textarea, [contenteditable=true]" }),
    step("nav.news", "Новости", (page) => navButton(page, "News").click(), text("Minecraft 26.3 is out")),
    step("nav.settings", "Настройки", (page) => navButton(page, "Settings").click(), text("Memory allocation")),
    ...["Downloads", "Interface", "Startup and tray", "Voice chat", "Privacy", "Storage", "Support", "About", "Game"].map((section) =>
      step(`settings.${section.toLowerCase().replace(/\s+/g, "-")}`, `Настройки: ${section}`, (page) =>
        main(page).getByRole("button", { name: new RegExp(`^${section}( \\d+)?$`) }).first().click(), noSkeleton),
    ),
    step("nav.assistant", "Ассистент", (page) => page.getByRole("button", { name: "Assistant", exact: true }).first().click(), text("New chat")),
    step("nav.newInstance", "Новая сборка", (page) => sidebar(page).getByRole("button", { name: "New instance", exact: true }).first().click(), text("Plain game, no mods")),
    step("nav.profile", "Профиль", (page) => sidebar(page).getByRole("button", { name: /^Playing as/ }).first().click(), text("Friend code")),
    step("profile.skins", "Профиль: скины (3D)", (page) => main(page).getByRole("button", { name: "Skins", exact: true }).first().click(), { within: "main", selector: "canvas" }),
    step("profile.achievements", "Профиль: достижения", (page) => main(page).getByRole("button", { name: "Achievements", exact: true }).first().click(), noSkeleton),
    step("profile.leaderboard", "Профиль: лидерборд", (page) => main(page).getByRole("button", { name: "Leaderboard", exact: true }).first().click(), noSkeleton),
    step("profile.modpacks", "Профиль: сборки", (page) => main(page).getByRole("button", { name: "Modpacks", exact: true }).first().click(), noSkeleton),
    step("profile.overview", "Профиль: обзор", (page) => main(page).getByRole("button", { name: "Overview", exact: true }).first().click(), text("Friend code")),
    step("nav.instance", "Экран сборки", (page) => openInstance(page, instanceName), text("Check integrity")),
    step("instance.content", "Сборка: контент (121)", (page) => tab(page, /^Content/).click(), text("Entity Model Features")),
    step("content.search", "Контент: поиск (ввод)", async (page) => {
      await main(page).getByPlaceholder(/Search installed/).click();
      await page.keyboard.type("sod", { delay: 90 });
    }, text("Sodium"), { kind: "typing" }),
    step("content.searchClear", "Контент: сброс поиска", async (page) => {
      await page.keyboard.press("Control+A");
      await page.keyboard.press("Backspace");
    }, text("Entity Model Features")),
    step("instance.worlds", "Сборка: миры", (page) => tab(page, /^Worlds/).click(), text("Nether Expedition")),
    step("instance.servers", "Сборка: серверы", (page) => tab(page, /^Servers/).click(), text("NoctVale")),
    step("instance.configs", "Сборка: конфиги", (page) => tab(page, /^Configs/).click(), text("sodium-options.json")),
    step("instance.settings", "Сборка: настройки", (page) => tab(page, /^Settings/).click(), text("Memory allocation")),
    step("instance.statistics", "Сборка: статистика", (page) => tab(page, /^Statistics/).click(), text("PLAYTIME BY DAY")),
    step("instance.logs", "Сборка: логи", (page) => tab(page, /^Logs/).click(), text("Closed normally")),
    step("instance.overview", "Сборка: обзор", (page) => tab(page, /^Overview/).click(), text("Check integrity")),
    step("instance.switch", "Переключение сборки", (page) => openInstance(page, "COBBLEVERSE"), text("COBBLEVERSE")),
    step("nav.heavyInstance", "Тяжёлая сборка (450 модов)", (page) => openInstance(page, heavyInstanceName), text("Check integrity")),
    step("heavy.content", "Тяжёлая сборка: контент", (page) => tab(page, /^Content/).click(), text("Entity Model Features")),
    step("heavy.search", "Тяжёлая сборка: поиск (ввод)", async (page) => {
      await main(page).getByPlaceholder(/Search installed/).click();
      await page.keyboard.type("api", { delay: 90 });
    }, text("Fabric API"), { kind: "typing" }),
    step("heavy.searchClear", "Тяжёлая сборка: сброс поиска", async (page) => {
      await page.keyboard.press("Control+A");
      await page.keyboard.press("Backspace");
    }, text("Entity Model Features")),
    step("heavy.scroll", "Тяжёлая сборка: прокрутка списка", async (page) => {
      const row = main(page).getByText("Entity Model Features").first();
      const box = (await row.boundingBox()) ?? { x: 700, y: 300, width: 10, height: 10 };
      await page.mouse.move(box.x + box.width / 2, box.y + 120);
      for (let i = 0; i < 24; i++) {
        await page.mouse.wheel(0, 360);
        await page.waitForTimeout(40);
      }
      for (let i = 0; i < 24; i++) {
        await page.mouse.wheel(0, -360);
        await page.waitForTimeout(40);
      }
    }, null, { kind: "frames" }),
    step("nav.home", "Главная (возврат из сборки)", (page) => navButton(page, "Play").click(), { selector: "[data-home-hero]" }),
  ];
}

export const memoryRoute = [
  { scope: "aside button", text: "People" },
  { scope: "aside button", text: "News" },
  { scope: "aside button", text: "Settings" },
  { scope: 'header button[aria-label="Assistant"]', text: "" },
  { scope: "aside button", text: "Playing as" },
  { scope: "main button", text: "Skins", wait: 1500 },
  { scope: "main button", text: "Achievements" },
  { scope: "main button", text: "Leaderboard" },
  { scope: "main button", text: "Overview" },
  { scope: "aside button", text: instanceName },
  { scope: "[role=tab]", text: "Content" },
  { scope: "[role=tab]", text: "Worlds" },
  { scope: "[role=tab]", text: "Servers" },
  { scope: "[role=tab]", text: "Configs" },
  { scope: "[role=tab]", text: "Statistics" },
  { scope: "[role=tab]", text: "Logs" },
  { scope: "aside button", text: heavyInstanceName },
  { scope: "[role=tab]", text: "Content", wait: 1000 },
  { scope: 'aside button[aria-label="New instance"]', text: "" },
  { scope: "aside button", text: "Play", wait: 1000 },
];

export { goHome };

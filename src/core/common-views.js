/* Sheet views shared by the site and the studio. */
import { h } from "./util.js";
import { icon } from "./icons.js";
import { t, languages, lang, setLanguage } from "./i18n.js";

/** Language picker. Native names only; each name carries its own lang/dir. */
export function languageView() {
  return {
    title: () => t("settings.language"),
    render(root) {
      const list = h("ul", { class: "list", role: "radiogroup", "aria-label": t("settings.language") });
      const rows = [];
      for (const l of languages()) {
        const row = h("button", {
          class: "row", type: "button", role: "radio", "aria-checked": String(l.code === lang()),
          onclick: async () => {
            await setLanguage(l.code, { persist: true });
            rows.forEach((r) => r.setAttribute("aria-checked", String(r.dataset.code === l.code)));
          },
          dataset: { code: l.code },
        },
          h("span", { class: "row-main" },
            h("span", { class: "row-label lang-name", lang: l.code, dir: l.dir }, l.name)),
          h("span", { html: icon("check", "check") }));
        rows.push(row);
        list.append(h("li", {}, row));
      }
      root.append(h("div", { class: "section" }, list));
    },
  };
}

/** Short privacy summary used in settings and on first run. */
export function privacySummaryView() {
  return {
    title: () => t("settings.privacy"),
    render(root) {
      const items = [["device", "privacy.l1"], ["cpu", "privacy.l2"], ["noUpload", "privacy.l3"], ["shield", "privacy.l4"], ["storage", "privacy.l5"], ["download", "privacy.l6"]];
      root.append(
        h("div", { class: "prose" }, h("p", { class: "lead" }, t("privacy.intro"))),
        h("div", { class: "section" },
          h("ul", { class: "list" }, items.map(([ic, key]) =>
            h("li", { class: "has-icon" }, h("div", { class: "row" }, h("span", { class: "row-icon", html: icon(ic) }), h("span", { class: "row-label" }, t(key))))))),
        h("div", { class: "section" },
          h("ul", { class: "list" }, h("li", {}, h("a", { class: "row", href: "#/privacy" },
            h("span", { class: "row-label" }, t("settings.readPrivacy")), h("span", { html: icon("chevron", "chev") }))))));
    },
  };
}

/* Sheet views shared by the site and the studio. */
import { h } from "./util.js";
import { close as closeSheet } from "../../components/sheet.js";
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

/** Privacy summary sheet (footer link and Settings › Privacy): one line, the key
    facts with icons, a note on what is stored, and a link to the full policy. */
export function privacySummaryView() {
  return {
    title: () => t("settings.privacy"),
    render(root) {
      const items = [["device", "privacy.l1"], ["globe", "privacy.l2"], ["noUpload", "privacy.l3"], ["storage", "privacy.l5"], ["download", "privacy.l6"]];
      root.append(
        h("p", { class: "sheet-lead" }, t("privacy.sheetLead")),
        h("div", { class: "section" },
          h("ul", { class: "list" }, items.map(([ic, key]) =>
            h("li", { class: "has-icon" }, h("div", { class: "row static" }, h("span", { class: "row-icon plain", html: icon(ic) }), h("span", { class: "row-label" }, t(key)))))),
          h("p", { class: "section-foot" }, t("privacy.sheetFoot"))),
        h("div", { class: "section" },
          h("ul", { class: "list" }, h("li", {}, h("a", { class: "row", href: "#/privacy", onclick: () => closeSheet() },
            h("span", { class: "row-label" }, t("settings.readPrivacy")), h("span", { html: icon("chevron", "chev") }))))));
    },
  };
}

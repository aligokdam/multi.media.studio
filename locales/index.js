/* Available languages. To add one: create locales/<code>.js exporting the same keys
   as en.js (missing keys fall back to English), then add an entry here and the code
   to the `supported` list in src/boot.js. `script` lets CSS tune typography per
   writing system (see "Script typography" in assets/css/base.css). */
export const LANGUAGES = [
  { code: "en", name: "English", english: "English", dir: "ltr", script: "latin" },
  { code: "fil", name: "Filipino", english: "Filipino", dir: "ltr", script: "latin" },
  { code: "fr", name: "Français", english: "French", dir: "ltr", script: "latin" },
  { code: "de", name: "Deutsch", english: "German", dir: "ltr", script: "latin" },
  { code: "ha", name: "Hausa", english: "Hausa", dir: "ltr", script: "latin" },
  { code: "id", name: "Bahasa Indonesia", english: "Indonesian", dir: "ltr", script: "latin" },
  { code: "it", name: "Italiano", english: "Italian", dir: "ltr", script: "latin" },
  { code: "pt", name: "Português", english: "Portuguese", dir: "ltr", script: "latin" },
  { code: "es", name: "Español", english: "Spanish", dir: "ltr", script: "latin" },
  { code: "tr", name: "Türkçe", english: "Turkish", dir: "ltr", script: "latin" },
  { code: "vi", name: "Tiếng Việt", english: "Vietnamese", dir: "ltr", script: "latin" },
  { code: "ar", name: "العربية", english: "Arabic", dir: "rtl", script: "arabic" },
  { code: "fa", name: "فارسی", english: "Persian", dir: "rtl", script: "arabic" },
  { code: "ur", name: "اردو", english: "Urdu", dir: "rtl", script: "nastaliq" },
  { code: "ru", name: "Русский", english: "Russian", dir: "ltr", script: "cyrillic" },
  { code: "zh", name: "中文", english: "Chinese", dir: "ltr", script: "cjk" },
  { code: "ja", name: "日本語", english: "Japanese", dir: "ltr", script: "cjk" },
  { code: "ko", name: "한국어", english: "Korean", dir: "ltr", script: "cjk" },
  { code: "hi", name: "हिन्दी", english: "Hindi", dir: "ltr", script: "indic" },
  { code: "mr", name: "मराठी", english: "Marathi", dir: "ltr", script: "indic" },
  { code: "bn", name: "বাংলা", english: "Bengali", dir: "ltr", script: "indic" },
  { code: "pa", name: "ਪੰਜਾਬੀ", english: "Punjabi", dir: "ltr", script: "indic" },
  { code: "ta", name: "தமிழ்", english: "Tamil", dir: "ltr", script: "indic" },
  { code: "te", name: "తెలుగు", english: "Telugu", dir: "ltr", script: "indic" },
];

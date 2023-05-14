import path from "path";
import fs from "fs/promises";
import { fetch } from "undici";

const languageComponentIds = {
  "fr-FR": "goaoclndmgofblfopkopecdpfhljclbd",
  "de-DE": "jclgnikdalajmocbnlgieibfmlejnhmg",
  "it-IT": "jhefnhlmpagbceldaobdpcjhkknfjohi",
  "es-ES": "jkcckmaejhmbhagbcebpejbihcnighdb",
  "en-US": "oegebmmcimckjhkhbggblnkjloogjdfg",
  "ja-JP": "onhpjgkfgajmkkeniaoflicgokpaebfa",
};

const languageNames = {
  "fr-FR": "Français",
  "de-DE": "Deutsch",
  "it-IT": "Italiano",
  "es-ES": "Español",
  "en-US": "English",
  "ja-JP": "日本語",
};

function compareVersions(a, b) {
  a = a ? a.split(".").map(Number) : [];
  b = b ? b.split(".").map(Number) : [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const num1 = a[i] || 0;
    const num2 = b[i] || 0;
    if (num1 < num2) {
      return 1;
    } else if (num1 > num2) {
      return -1;
    }
  }
  return 0;
}

class SodaLanguage {
  #code;
  constructor(code) {
    if (!(code in languageComponentIds)) {
      throw new TypeError("Unknown language code " + code);
    }
    this.#code = code;
  }
  get code() {
    return this.#code;
  }
  get name() {
    return languageNames[this.code];
  }
  get path() {
    return path.join(
      process.env.XDG_DATA_HOME ||
        path.join(process.env.HOME, ".local", "share"),
      "SODALanguagePacks",
      this.code
    );
  }
  async versions() {
    let children;
    try {
      children = await fs.readdir(this.path);
    } catch (e) {
      return [];
    }
    return children;
  }
  async latest() {
    const versions = await this.versions();
    return versions.sort(compareVersions)[0];
  }
  get appid() {
    return languageComponentIds[this.code];
  }
  async updateCheck() {
    const update = JSON.parse(
      (
        await (
          await fetch("https://update.googleapis.com/service/update2/json", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              request: {
                acceptformat: "crx3",
                app: [{ appid: this.appid, updatecheck: {} }],
                protocol: "3.1",
              },
            }),
          })
        ).text()
      ).slice(")]}'\n".length)
    );
    const app = update.response.app[0];
    if (app.appid !== this.appid) {
      throw new Error("appid doesn't match");
    }
    const urls = app.updatecheck.urls.url.filter((e) =>
      e.codebase.startsWith("https:")
    );
    const url =
      urls[Math.round(Math.random() * (urls.length - 1))].codebase +
      app.updatecheck.manifest.packages.package[0].name;
    const newVersion = app.updatecheck.manifest.version;
    if (compareVersions(newVersion, await this.latest()) < 0) {
      return {
        version: newVersion,
        url,
        size: app.updatecheck.manifest.packages.package[0].size,
      };
    } else {
      return null;
    }
  }
}

export default Object.keys(languageComponentIds).map(
  (e) => new SodaLanguage(e)
);

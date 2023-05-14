import enquirer from "enquirer";
import ora, { oraPromise } from "ora";
import prettyBytes from "pretty-bytes";
import languages from "./language_provider.js";
import chalk from "chalk";
import path from "path";
import fs from "fs/promises";
import { createWriteStream } from "fs";
import { fetch } from "undici";
import { Readable } from "stream";
import { temporaryDirectoryTask } from "tempy";
import { spawn } from "child_process";

const { Select, Confirm } = enquirer;
const languageNames = languages.map((lang) => lang.name);
const languagePicker = new Select({
  name: "language",
  message: "Select a language:",
  choices: languageNames,
});
const selectedLanguageName = await languagePicker.run();
const selectedLanguage = languages.find(
  (lang) => lang.name === selectedLanguageName
);
const currentVersion = await selectedLanguage.latest();
if (currentVersion) {
  console.log(`  Current version: ${currentVersion}`);
} else {
  console.log(`  Not installed`);
}
const update = await oraPromise(selectedLanguage.updateCheck(), {
  text: "Checking for updates",
  successText: "\x1b[2K\r",
});
process.stdout.write("\x1b[A");
if (update) {
  const prompt = new Confirm({
    name: "question",
    message:
      "Do you want to " +
      (currentVersion ? "update to" : "install") +
      " version " +
      update.version +
      "? " +
      chalk.dim("(" + prettyBytes(update.size) + ")"),
  });
  if (await prompt.run()) {
    await fs.mkdir(selectedLanguage.path, { recursive: true });
    const response = await oraPromise(fetch(update.url), {
      text: "Starting download",
      successText: "\x1b[2K\r",
    });
    process.stdout.write("\x1b[A");
    await temporaryDirectoryTask(async (tmp) => {
      const modelZip = path.join(tmp, "model.zip");
      const model = path.join(tmp, "model");

      const spinner = ora().start();
      try {
        const body = Readable.fromWeb(response.body);
        let downloaded = 0;
        function updateSpinner() {
          spinner.text = `Downloading ${chalk.dim("(")}${prettyBytes(
            downloaded
          ).padStart(7, " ")} ${chalk.dim("/")} ${prettyBytes(
            update.size
          ).padStart(7, " ")}${chalk.dim(")")}`;
        }
        updateSpinner();
        body.on("data", (chunk) => {
          downloaded += chunk.length;
          updateSpinner();
        });
        const piped = body.pipe(createWriteStream(modelZip));
        await new Promise((cb, ecb) => {
          body.on("end", () => {
            cb();
          });
          body.on("error", () => {
            ecb();
          });
        });
        spinner.text = "Extracting";
        const unzipProcess = spawn("unzip", [modelZip, "-d", model]);
        await new Promise((cb, ecb) =>
          unzipProcess.on("close", (code) => {
            cb(fs.access(model));
          })
        );
        await fs.rename(
          model,
          path.join(selectedLanguage.path, update.version)
        );
        for (const oldVersion of (await selectedLanguage.versions()).filter(
          (e) => e !== update.version
        )) {
          await fs.rm(path.join(selectedLanguage.path, oldVersion), {
            recursive: true,
          });
        }
        spinner.succeed(
          (currentVersion ? "Updated to" : "Installed") +
            " version " +
            update.version
        );
      } finally {
        spinner.stop();
      }
    });
  }
} else {
  console.log(`  Up to date`);
}

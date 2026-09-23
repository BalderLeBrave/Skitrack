import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { candidatsPython, raisonPython } from "./python.server.ts";

const cmds = (c: { cmd: string; args: string[] }[]) => c.map((x) => [x.cmd, ...x.args].join(" "));

test("Windows : le venv des workers, puis py -3, et python3 en dernier (alias du Store)", () => {
  const got = cmds(candidatsPython("win32", {}, "C:/app/scrape"));
  assert.deepEqual(got, [join("C:/app/scrape", ".venv", "Scripts", "python.exe"), "py -3", "python", "python3"]);
});

test("ailleurs : python3 avant python", () => {
  const got = cmds(candidatsPython("linux", {}, "/app/scrape"));
  assert.deepEqual(got, [join("/app/scrape", ".venv", "bin", "python"), "python3", "python"]);
});

test("la variable explicite passe en tête, sans doublon", () => {
  const got = cmds(
    candidatsPython("linux", { SKITRACK_PYAIRBNB_PYTHON: " /opt/py ", SKITRACK_PYTHON: "python3" }, null, "SKITRACK_PYAIRBNB_PYTHON"),
  );
  assert.deepEqual(got, ["/opt/py", "python3", "python"]);
});

test("la raison dit ce qui manque, et rien quand tout est là", () => {
  assert.match(raisonPython(null) ?? "", /aucun Python 3/);
  assert.match(raisonPython({ cmd: "py", args: ["-3"], manquants: ["curl_cffi"] }) ?? "", /curl_cffi/);
  assert.equal(raisonPython({ cmd: "py", args: ["-3"], manquants: [] }), null);
});

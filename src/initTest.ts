import { fork } from "child_process";
import Mocha from "mocha";
import fs from "fs";
import path from "path";

// Instantiate a Mocha instance.
const mocha = new Mocha();

const appProc = fork("./dist/app", process.argv.length >= 3 ? [process.argv[2]] : []);

/** Set once the server reports ready, so a deliberate teardown is not reported as a crash. */
let serverReady = false;

/** Kill the forked server, then exit. Without the kill the orphaned child keeps
 *  the inherited stdout pipe open, so `npm test` never returns and a stray
 *  server is left listening. */
function shutdown(code: number): never {
	if (!appProc.killed) {
		appProc.kill();
	}
	process.exit(code);
}

appProc.on("message", function (message) {
	if (message == "ready") {
		serverReady = true;
		console.log("Server Running");

		const testDir = "./dist/tests";

		// The compiled tests directory can be absent if src/tests holds no .ts files.
		if (fs.existsSync(testDir)) {
			// Add each .js file to the mocha instance
			fs.readdirSync(testDir)
				.filter(function (file) {
					// Only keep the .js files. The original used indexOf(".js") > -1,
					// which also matched the .js.map sourcemaps tsc now emits — Mocha
					// then loaded a JSON file as JavaScript and hung.
					return file.endsWith(".js");
				})
				.forEach(function (file) {
					mocha.addFile(path.join(testDir, file));
				});
		}

		// Run the tests.
		mocha
			.run(function (failures) {
				shutdown(failures ? 1 : 0);
			})
			.on("end", function () {
				console.log("Tests finished");
			});
	}
});

appProc.on("error", function (err) {
	console.error("Error occured on the server", err.message);
	shutdown(1);
});

appProc.on("exit", function () {
	// Only a crash before the tests started is an error; the shutdown above
	// kills this same child on the normal path.
	if (serverReady) return;
	const msg = "Server exited before tests";
	console.error(msg);
	process.exit(1);
});

appProc.on("SIGTERM", function () {
	shutdown(1);
});

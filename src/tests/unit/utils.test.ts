import { expect } from "chai";
import fs from "fs";
import os from "os";
import path from "path";
import { dirIterator, getValidHttpMethod } from "../../utils";

describe("getValidHttpMethod", () => {
	it("extracts a lowercase method from an uppercase key", () => {
		expect(getValidHttpMethod("GET /test")).to.equal("get");
	});

	it("accepts a bare method name", () => {
		expect(getValidHttpMethod("post")).to.equal("post");
	});

	it("is case-insensitive", () => {
		expect(getValidHttpMethod("Delete /thing")).to.equal("delete");
	});

	it("returns null for an unknown method", () => {
		expect(getValidHttpMethod("GTE /test")).to.equal(null);
	});

	it("returns null for a bare path", () => {
		expect(getValidHttpMethod("/test")).to.equal(null);
	});

	it("returns null for empty and nullish input", () => {
		expect(getValidHttpMethod("")).to.equal(null);
		expect(getValidHttpMethod(undefined)).to.equal(null);
		expect(getValidHttpMethod(null)).to.equal(null);
	});

	it("is not stateful across calls", () => {
		expect(getValidHttpMethod("GET /a")).to.equal("get");
		expect(getValidHttpMethod("GET /b")).to.equal("get");
	});
});

describe("dirIterator", () => {
	let tmp: string;

	beforeEach(() => {
		tmp = fs.mkdtempSync(path.join(os.tmpdir(), "grogu-"));
	});

	afterEach(() => {
		fs.rmSync(tmp, { recursive: true, force: true });
	});

	it("iterates zero files when the directory does not exist", () => {
		const seen: string[] = [];
		dirIterator(path.join(tmp, "definitely-absent"), (name) => seen.push(name));
		expect(seen).to.deep.equal([]);
	});

	it("yields only .js files", () => {
		fs.writeFileSync(path.join(tmp, "One.js"), "");
		fs.writeFileSync(path.join(tmp, "Two.ts"), "");
		fs.writeFileSync(path.join(tmp, "Three.js.map"), "");
		const seen: string[] = [];
		dirIterator(tmp, (name) => seen.push(name));
		expect(seen).to.deep.equal(["One"]);
	});

	it("names a module by its first dot-segment", () => {
		fs.writeFileSync(path.join(tmp, "My.Controller.js"), "");
		const seen: string[] = [];
		dirIterator(tmp, (name) => seen.push(name));
		expect(seen).to.deep.equal(["My"]);
	});

	it("skips directories and extensionless files", () => {
		fs.mkdirSync(path.join(tmp, "nested"));
		fs.writeFileSync(path.join(tmp, ".gitkeep"), "");
		const seen: string[] = [];
		dirIterator(tmp, (name) => seen.push(name));
		expect(seen).to.deep.equal([]);
	});

	it("passes the full path as the second argument", () => {
		fs.writeFileSync(path.join(tmp, "One.js"), "");
		const seen: string[] = [];
		dirIterator(tmp, (_name, filepath) => seen.push(filepath));
		expect(seen).to.deep.equal([tmp + "/One.js"]);
	});
});

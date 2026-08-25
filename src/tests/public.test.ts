import chai from "chai";
import chaiHttp from "chai-http";

chai.use(chaiHttp);
const expect = chai.expect;

const BASE_URL = "http://localhost:" + (process.env.PORT ? process.env.PORT : "3000");

describe("Public controller", () => {
	it("serves GET /Public/v1.0/test", async () => {
		const res = await chai.request(BASE_URL).get("/Public/v1.0/test");
		expect(res).to.have.status(200);
		expect(res.body).to.deep.equal({ ok: true, message: "hello world" });
	});

	it("does not serve the route without the version prefix", async () => {
		const res = await chai.request(BASE_URL).get("/Public/test");
		expect(res).to.have.status(404);
	});
});

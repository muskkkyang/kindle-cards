import { randomInt } from "node:crypto";

// Fetch rejects several low-numbered ports even for loopback. Keep fixtures in
// the dynamic range and let listen() reserve the port without a probe race.
export async function listenForTest(app) {
  for (let attempt = 0; attempt < 32; attempt += 1) {
    try {
      const server = await new Promise((resolve, reject) => {
        const instance = app.listen(randomInt(49152, 65536), "127.0.0.1");
        instance.once("error", reject);
        instance.once("listening", () => resolve(instance));
      });
      return {
        server,
        baseUrl: `http://127.0.0.1:${server.address().port}`,
      };
    } catch (error) {
      if (error.code !== "EADDRINUSE" && error.code !== "EACCES") throw error;
    }
  }
  throw new Error("No available loopback port for the test fixture.");
}

import https from "https";

https.get("https://api-inference.huggingface.co/status", (res) => {
  console.log("Status Code:", res.statusCode);
  res.on("data", (d) => {
    process.stdout.write(d);
  });
}).on("error", (e) => {
  console.error("Error:", e.message);
});

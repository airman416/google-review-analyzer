fetch("http://localhost:3000/api/analyze-restaurant", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "McDonalds", place_id: "ChIJc_yX3HhYwokRs8eX_j456-Q" })
}).then(res => {
  console.log("Status:", res.status);
  return res.text();
}).then(text => console.log("Body:", text)).catch(console.error);

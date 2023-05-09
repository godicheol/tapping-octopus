const express = require("express")
const app = express();
const PORT = 8000;

app.get("/", function(req, res, next) {
    res.writeHead(200, {'Content-Type': 'text/json;charset=utf-8'});
    res.end('{"testcode":"200", "text":"Electorn Test~"}');
})

app.listen(PORT, function() {
    console.log("Express server listening on port " + PORT)
})
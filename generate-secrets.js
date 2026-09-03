const crypto=require("crypto");
console.log("SESSION_SECRET="+crypto.randomBytes(48).toString("base64url"));
console.log("JWT_SECRET="+crypto.randomBytes(48).toString("base64url"));

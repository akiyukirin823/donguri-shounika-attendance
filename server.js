require("dotenv").config();
const express=require("express"), helmet=require("helmet"), rateLimit=require("express-rate-limit");
const session=require("express-session"), pgSession=require("connect-pg-simple")(session);
const {Pool}=require("pg"), bcrypt=require("bcryptjs"), jwt=require("jsonwebtoken"), path=require("path"), crypto=require("crypto");

const app=express();
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.NODE_ENV==="production"?{rejectUnauthorized:false}:false});
app.set("trust proxy",1);
app.use(helmet({contentSecurityPolicy:false}));
app.use(express.json({limit:"200kb"}));
app.use(rateLimit({windowMs:15*60*1000,max:300}));
app.use(session({store:new pgSession({pool,tableName:"user_sessions",createTableIfMissing:true}),secret:process.env.SESSION_SECRET,resave:false,saveUninitialized:false,cookie:{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",maxAge:1000*60*60*12}}));

async function q(text,params=[]){return (await pool.query(text,params)).rows}
function sign(payload){return jwt.sign(payload,process.env.JWT_SECRET,{expiresIn:"12h"})}
function auth(req,res,next){try{req.user=jwt.verify((req.headers.authorization||"").replace(/^Bearer\s+/,""),process.env.JWT_SECRET);next()}catch{return res.status(401).json({error:"認証が必要です"})}}
function adminAuth(req,res,next){return auth(req,res,next)}
function todayJST(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())}

app.get("/health",async(req,res)=>{try{await q("SELECT 1");res.json({ok:true,time:new Date().toISOString()})}catch(e){res.status(503).json({ok:false})}});
app.get("/config.js",(req,res)=>res.json({liffId:process.env.LINE_LIFF_ID||""}));

async function verifyLineIdToken(idToken){
 const r=await fetch("https://api.line.me/oauth2/v2.1/verify",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({id_token:idToken,client_id:process.env.LINE_CHANNEL_ID})});
 const j=await r.json(); if(!r.ok) throw new Error(j.error_description||"LINE ID token verification failed"); return j;
}
app.post("/api/auth/line",async(req,res)=>{
 try{
  const p=await verifyLineIdToken(req.body.idToken);
  let em=(await q("SELECT * FROM employees WHERE line_user_id=$1 AND active=true",[p.sub]))[0];
  if(!em) return res.status(403).json({error:"管理者から招待コードでLINEアカウントを登録してください"});
  res.json({token:sign({type:"employee",employeeId:em.id}),employee:{id:em.id,name:em.name}});
 }catch(e){res.status(401).json({error:e.message})}
});
app.post("/api/attendance/action",auth,async(req,res)=>{
 if(req.user.type!=="employee") return res.status(403).json({error:"権限エラー"});
 const {action}=req.body, allowed=["in","out","break-start","break-end"];
 if(!allowed.includes(action)) return res.status(400).json({error:"不正な操作"});
 const d=todayJST();
 let a=(await q("SELECT * FROM attendance WHERE employee_id=$1 AND work_date=$2",[req.user.employeeId,d]))[0];
 if(!a){a=(await q("INSERT INTO attendance(employee_id,work_date) VALUES($1,$2) RETURNING *",[req.user.employeeId,d]))[0]}
 if(action==="in") await q("UPDATE attendance SET clock_in=COALESCE(clock_in,NOW()),updated_at=NOW() WHERE id=$1",[a.id]);
 if(action==="out") await q("UPDATE attendance SET clock_out=NOW(),updated_at=NOW() WHERE id=$1",[a.id]);
 if(action==="break-start") await q("INSERT INTO breaks(attendance_id,break_start) VALUES($1,NOW())",[a.id]);
 if(action==="break-end") await q("UPDATE breaks SET break_end=NOW() WHERE attendance_id=$1 AND break_end IS NULL",[a.id]);
 res.json({ok:true,action,date:d});
});
app.get("/api/admin/staff",adminAuth,async(req,res)=>{
 const d=req.query.date||todayJST();
 const rows=await q(`SELECT e.id,e.name,e.active,e.invite_code,a.clock_in,a.clock_out,
  (SELECT count(*) FROM breaks b WHERE b.attendance_id=a.id) AS break_count
  FROM employees e LEFT JOIN attendance a ON a.employee_id=e.id AND a.work_date=$1
  ORDER BY e.id`,[d]);
 res.json({date:d,staff:rows});
});
app.post("/api/admin/employees",adminAuth,async(req,res)=>{
 const name=String(req.body.name||"").trim(); if(!name)return res.status(400).json({error:"氏名が必要です"});
 const code=crypto.randomBytes(4).toString("hex");
 const row=(await q("INSERT INTO employees(name,invite_code) VALUES($1,$2) RETURNING id,name,invite_code",[name,code]))[0];
 res.json(row);
});
app.post("/api/admin/employees/:id/invite",adminAuth,async(req,res)=>{
 const code=crypto.randomBytes(4).toString("hex");
 const row=(await q("UPDATE employees SET invite_code=$1 WHERE id=$2 RETURNING id,name,invite_code",[code,req.params.id]))[0];
 res.json(row||{error:"not found"});
});
app.post("/api/admin/invite-link",adminAuth,async(req,res)=>{
 const employeeId=Number(req.body.employeeId), lineUserId=String(req.body.lineUserId||"").trim(), code=String(req.body.inviteCode||"").trim();
 const row=(await q("SELECT * FROM employees WHERE id=$1 AND invite_code=$2 AND active=true",[employeeId,code]))[0];
 if(!row)return res.status(400).json({error:"招待コードが一致しません"});
 await q("UPDATE employees SET line_user_id=$1,invite_code=NULL WHERE id=$2",[lineUserId,employeeId]);
 res.json({ok:true});
});
app.post("/api/admin/login",async(req,res)=>{
 const row=(await q("SELECT * FROM admins WHERE email=$1",[String(req.body.email||"").trim()]))[0];
 if(!row||!(await bcrypt.compare(String(req.body.password||""),row.password_hash)))return res.status(401).json({error:"ログイン情報が正しくありません"});
 res.json({token:sign({type:"admin",adminId:row.id})});
});
app.get("/api/admin/export.csv",adminAuth,async(req,res)=>{
 const rows=await q(`SELECT e.name,a.work_date,a.clock_in,a.clock_out,
 COALESCE((SELECT SUM(EXTRACT(EPOCH FROM (COALESCE(b.break_end,NOW())-b.break_start))/60) FROM breaks b WHERE b.attendance_id=a.id),0) AS break_minutes
 FROM attendance a JOIN employees e ON e.id=a.employee_id ORDER BY a.work_date DESC,e.id`);
 const esc=v=>`"${String(v??"").replace(/"/g,'""')}"`;
 const out=["氏名,日付,出勤,退勤,休憩分",...rows.map(x=>[x.name,x.work_date,x.clock_in?new Date(x.clock_in).toLocaleString("ja-JP",{timeZone:"Asia/Tokyo"}):"",x.clock_out?new Date(x.clock_out).toLocaleString("ja-JP",{timeZone:"Asia/Tokyo"}):"",Math.round(x.break_minutes)].map(esc).join(","))].join("\n");
 res.setHeader("Content-Type","text/csv; charset=utf-8");res.setHeader("Content-Disposition",'attachment; filename="donguri-attendance.csv"');res.send("\uFEFF"+out);
});
app.use(express.static(path.join(__dirname,"public")));
app.get("/admin",(req,res)=>res.sendFile(path.join(__dirname,"public","admin.html")));
app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));

const port=process.env.PORT||3000;
app.listen(port,()=>console.log(`server listening on ${port}`));
const fetch = import('node-fetch');
const express = require('express');
const { MongoClient,ObjectId} = require("mongodb");
const { createClient }=require('redis');
const jwt=require("jsonwebtoken");
const bodyParser=require("body-parser");
const path=require("path");
const multer=require("multer");
const cors=require("cors");
const urlMongo="mongodb://localhost:27017/";
const urlRedis="redis://localhost:6379";
var clientMongo = new MongoClient(urlMongo);
const app = express();

global.fetcher=async(url,body=null,method="GET")=>{
  try{
    var params={
      method: method,//method
      mode: "cors", // no-cors, *cors, same-origin
      cache: "no-cache", // *default, no-cache, reload, force-cache, only-if-cached
      credentials: "same-origin", // include, *same-origin, omit
      headers: {
          "Content-Type": "application/json",
          // 'Content-Type': 'application/x-www-form-urlencoded',
      },
      redirect: "follow", // manual, *follow, error
      referrerPolicy: "no-referrer", // no-referrer, *no-referrer-when-downgrade, origin, origin-when-cross-origin, same-origin, strict-origin, strict-origin-when-cross-origin, unsafe-url
    };
    // if(localStorage.getItem("token")!==null){
    //     params["credentials"]= "include";
    //     params["headers"]["Authorization"]="Bearer "+localStorage.getItem("token");
    // }
    if(body!==null){
        if(method=="GET"){params.method="POST";}
        params={...params,...{body:JSON.stringify(body)}}
    }
    
    var f=await fetch(url, params);
    var res=await f.json();
    if(res.value!==undefined){
      //SUCCESS LOG
    } else {
      //ERROR LOG
    }
    if(res.msg!==undefined){
      //MSG FOR LOG
    } 
  } catch(e){
    //ERROR LOG
  }
}
global.dbRedis=async(operation,key,value)=>{
  var clientRedis = new createClient({url: urlRedis});
//.on('error', err => 
  try {
    await clientRedis.connect();
    var doc1=null;
    if(operation=="set"){
      await clientRedis.set(key, value);
    } else if(operation=="get"){
      doc1= await clientRedis.get(key);
    } else if(operation=="del"){
      doc1= await clientRedis.del(key);
    }
    return await doc1;
  } catch(ex){
    return ex;
  } finally {
    await clientRedis.disconnect();
  }
}
global.db=async (collection,operation,query={},options={},update={},db="flight")=>{
  try {
    await clientMongo.connect();
    const dbo = clientMongo.db(db);
    var doc1=null;
    if(operation=="findOne"){
      doc1=await dbo.collection(collection).findOne(query,options);
    } else if(operation=="find"){
      doc1=await dbo.collection(collection).find(query,options).toArray();
    } else if(operation=="update"){
      doc1=await dbo.collection(collection).updateOne(query,{$set:update});
    } else if(operation=="updateMany"){
      doc1=await dbo.collection(collection).updateMany(query,{$set:update});
    } else if(operation=="insert"){
      doc1=await dbo.collection(collection).insertOne(query);
    } else if(operation=="insertMany"){
      doc1=await dbo.collection(collection).insertMany(query);
    } else if(operation=="remove"){
      doc1=await dbo.collection(collection).remove(query);
    } else if(operation=="drop"){
      doc1=await dbo.collection(collection).drop();
    }
    return await doc1;
    
  } catch(ex){
      return ex;
  } finally {
    await clientMongo.close();
  }
}
global.authentication=async(req,res,next)=> {
  var res1=res,req1=req;
  var token=req.headers["authorization"];
  if(token!==undefined){
      try{
        if(token.indexOf("Bearer ")!==0)throw "Token not found";
        token=token.split(' ')[1];
        req.jwtpayload=jwt.verify(token,jwtkey);
        
        await dbRedis("get",token).then((e)=>{
          res.on("finish", function() {
            //
          });
          if(req.path=="/api/trips"&&req.jwtpayload.role.indexOf("admin")==-1&&["post","put","patch","delete"].indexOf(req.method.toLowerCase())!==-1){
            res1.status(401).end(JSON.stringify({msg:"Unauthorized Access!"}));
            return;
          }
          if(req.path=="/api/all"&&req.jwtpayload.role.indexOf("admin")==-1){
            res1.status(401).end(JSON.stringify({msg:"Unauthorized Access!"}));
            return;
          }
          if(req.path=="/api/trips"&&["co-pilot","pilot","flight_attendant","admin"].indexOf(req.jwtpayload.role[0])==-1&&["get"].indexOf(req.method.toLowerCase())!==-1){
            res1.status(401).end(JSON.stringify({msg:"Unauthorized Access!"}));
            return;
          }
          
        });
        if(req.path=="/api/logout/"){
          await dbRedis("del",token).then((e)=>{
            next();
            return;
          });
        }
        await next();
      } catch(ex){
        res1.status(401).end(JSON.stringify({msg:"Unauthorized Access!"}));
      }
  } else {
    res1.status(401).end(JSON.stringify({msg:"Unauthorized Access!"}));
  }
}
global.tokengenerate= async(payload)=>{
  const token=jwt.sign(payload,jwtkey),d=new Date();
  const expire={exp:(new Date(d.getTime() + 900000))};
  const value={token:token,expire:expire,payload,create_time:d,modify_time:d,status:1};
  dbRedis("set",token,JSON.stringify(value));
  db("sessions","insert",value);
  // 
  return token;
}
//const urlencodedParser=bodyParser.urlencoded({extended:false});
//app.use(cookieParser());
//app.use(express.static("pages",options));
//app.use(express.static("public",options));
// app.use(cors());
const corsOptions ={
  origin:(process.env.CLIENT||'http://localhost:3000'),
  methods:["GET","POST","PUT","PATCH","DELETE"], 
  credentials:true,            //access-control-allow-credentials:true
  optionSuccessStatus:200,
}
console.log(corsOptions);
app.use(cors(corsOptions)) // Use this after the variable declaration
// app.use(multer({dest:path.join(__dirname,"public/update/temp/")}).any());
app.use( bodyParser.json() );       // to support JSON-encoded bodies
app.use(bodyParser.urlencoded({     // to support URL-encoded bodies
  extended: true
}));
// const userServiceProxy = httpProxy('http://localhost:8080')
var ipaddress = process.env.OPENSHIFT_NODEJS_IP || "localhost";
var port = process.env.OPENSHIFT_NODEJS_PORT || process.env.PORT || 8080;
//<em>// Authentication</em>
var apis={};
app.set('trust proxy', true);
app.use(async(req, res,next) => {
  try{
    console.log(req.path +" "+req.method);
    if(req.path=="/"&&req.method.toUpperCase()=="GET"){
      res.status(200).end("Server is running...");
      return;
    } else if(req.path=="/registerapis"&&req.method.toUpperCase()=="POST"){
      req.body.forEach(e=>{
        e.methods.forEach(e1=>{
          var {methods,path,...body}=e;
          if(body["host"]==undefined){
            body["host"]=(req.ip.indexOf(":")==-1)?req.ip:"["+req.ip+"]";
          }
          if(apis[e1]===undefined){apis[e1]={};}
          apis[e1]['^'+path.replace(/:[A-Za-z0-9_]+/g,"([A-Za-z0-9_]+)").replace(/\//g,'\\/')+'$']=body;
        })
      })
      res.status(200).end(JSON.stringify({value:[]}));
      return;
    }
    delete req.headers["content-length"];
    var params={
      method: req.method,//method
      mode: "cors", // no-cors, *cors, same-origin
      cache: "no-cache", // *default, no-cache, reload, force-cache, only-if-cached
      credentials: req.credentials, // include, *same-origin, omit
      headers: req.headers,
      redirect: "follow", // manual, *follow, error
      referrerPolicy: "no-referrer", // no-referrer, *no-referrer-when-downgrade, origin, origin-when-cross-origin, same-origin, strict-origin, strict-origin-when-cross-origin, unsafe-url
    };
    if(["GET","HEAD"].indexOf(req.method)==-1){
      if(!(req.body===undefined||req.body===null)){
        params={...params,...{body:JSON.stringify(req.body)}}
      }
    }
    if(apis[req.method.toLowerCase()]!==undefined){
      var apismethod=apis[req.method.toLowerCase()];
      var keys=Object.keys(apismethod),obj=null;
      for(var i=0;i<keys.length;i++){
        if((new RegExp(keys[i], 'gu')).test(req.path)){
          obj=apismethod[keys[i]];
          var f=await fetch("http://"+obj.host+":"+obj.port+req.originalUrl, params);
          var res2=await f.text();
          res.status(f.status).end(res2);
          return;
        }
      }
    }
    res.status(404).end(JSON.stringify({msg:"Not Found"}));
  } catch(e){
    console.log(e);
    res.status(503).end(JSON.stringify({msg:"Server Error"}));return;
  }
  return;
})

app.listen(port,ipaddress,function(){
  console.log("Server running on port "+port);
})

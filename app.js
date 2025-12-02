require("dotenv").config();
const axios = require("axios");
const crypto = require('crypto');
const express = require("express");
const cors = require("cors");
const app = express();
const HTMLParser  = require('node-html-parser');
const fs = require("fs");
const DB = require("./connectDB.js");


const usersBotDB = DB.connect("pw_bot");
const usersAppDB = DB.connect("pw_app");

const imagesDB = DB.connect("pw_images");
const serversDB = DB.connect("pw_servers");



//const accountBase = DB.connect("pw_accounts");

app.use(cors({ methods: ["GET", "POST"] }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = +process.env.ADMIN_ID;

// serverBase.insertOne({
//   id_hash: "OgKD45",
//   url: "https://pw-server-1.onrender.com",
//   max_users: 5,
//   API_ID: "",
//   API_HASH: "",
//   auth_users: []
// });



// serverBase.insertOne({
//   id_server: "OgKD45",
//   url: "https://pw-server-1.onrender.com",
//   max_users: 5,
//   current_users: 0,
//   API_ID: "",
//   API_HASH: "",
//   auth_users: []
// });

const USERS = {};

const LEVEL_SUBSCRIPTION = {
  'Уровень 1': {
    max_accounts: 1,
    max_posts: 3
  },
  'Уровень 2': {
    max_accounts: 2,
    max_posts: 6
  }
}


//+
app.post('/auth/phone', async (req, res) => {
  const { id, phone } = req.body;
  if(!USERS[id]){
    const SERVERS = await serversDB.find({}).toArray();
    for(const server of SERVERS){
      if(server.current_users < server.max_users){
        console.log(server.id_server);
        await serversDB.updateOne({ id_server: server.id_server }, { $inc : { current_users: 1 }});
        USERS[id] = server.url;
        break;
      }
    }
  }

  const response = await axios.post(`${USERS[id]}/auth/phone`,  { id, phone }, { headers: { "Content-Type": "application/json" } });
  res.json(response.data);
});

app.post('/auth/code-password', async (req, res) => {
  const { id, username, code, password } = req.body;
  console.log(req.body);
  if(USERS[id]){
    // AXIOS RESPOSE USERS[id];
    const response = await axios.post(`${USERS[id]}/auth/code-password`,  { id, username, code, password }, { headers: { "Content-Type": "application/json" } });

    console.log(response.data);
  
    res.json(response.data);
  }
  else{
    res.json({ type: 'error', msg:'Вас не найденно в списке!'});
  }
});



//+
app.post('/auth/login', async (req, res) => {
  const { id, username, initData } = req.body;
  const user =  await usersBotDB.findOne({ id, username });
  const isVerify = true; //await verifyTelegramInitData(initData);
  //console.log(isVerify);


  if(user === null || user.isBanned || !user.isValid || !isVerify){
    res.json({ type: 'error', accounts: [] });
  }
  else if(!user.isBanned && user.isValid && isVerify){
    const option = LEVEL_SUBSCRIPTION[user.subscription];

    const accountsRaw =  await usersAppDB.find({ id }).toArray();

    const accounts = accountsRaw.map(account => {
      return { id_server: account.id_server,  hash: account.hash, full_name: account.full_name, posts: account.posts }
    });
    res.json({ type: 'succes', accounts, token_imgbb: process.env.TOKEN_IMGBB, option });
  }
});









//+
app.post('/upload-image', async (req, res) => {
  const { id, current, thumb } = req.body;
  await imagesDB.insertOne({ id, current, thumb });
  res.json({ type: 200 });
});
app.post('/images', async (req, res) => {
  const { id } = req.body;
  const imagesRaw = await imagesDB.find({ id }).toArray();
  const images = imagesRaw.map(({current, thumb}) =>  { 
    return { current, thumb }
  })
  res.json({ images });
});



// await dataBase.updateOne({ hash }, { $push: { "posts": post_editor }});

app.post('/add-post', async (req, res) => { 
  const { id, id_server, hash, post_editor } = req.body
  await usersAppDB.updateOne({ hash }, { $push: { "posts": post_editor } });
  
  try{
    const URL_MY_LOGIN = await serversDB.findOne({ id_server });
    await axios.post(`${URL_MY_LOGIN.url}/api/add-post`,  { post_editor, hash }, { headers: { "Content-Type": "application/json" } });
    
    const answer = await sendToTelegram(id, post_editor.post_text, post_editor.post_image);
    if(answer.data.type == 500){
      await sendToTelegram(id, "<blockquote><b>Ошибка:</b> Cкорее всего вы не закрыли тег html</blockquote>");
    }
  }
  catch(e){
    //await sendToTelegram(id, "<blockquote><b>Ошибка:</b> Cкорее всего вы не закрыли тег html</blockquote>");
  }

  const { posts } =  await usersAppDB.findOne({ hash });
  //console.log( posts );
  res.json({ posts });
});
// dataBase.updateOne({ hash, "posts.id": post_editor.id }, { $set: { "posts.$": post_editor }});
app.post('/update-post', async (req, res) => { 
  const { id, id_server, hash, post_editor } = req.body

  await usersAppDB.updateOne({ id, id_server, hash, "posts.id": post_editor.id }, { $set: { "posts.$": post_editor } });
  
  try{
    const URL_MY_LOGIN = await serversDB.findOne({ id_server });
    await axios.post(`${URL_MY_LOGIN.url}/api/update-post`,  { post_editor, hash }, { headers: { "Content-Type": "application/json" } });

    const answer = await sendToTelegram(id, post_editor.post_text, post_editor.post_image);
    if(answer.data.type == 500){
      await sendToTelegram(id, "<blockquote><b>Ошибка:</b> Cкорее всего вы не закрыли тег html</blockquote>");
    } 
  }
  catch(e){
    //await sendToTelegram(id, "<b>Ошибка скорее всего вы не закрыли тег html</b>");
  }

  const { posts } =  await usersAppDB.findOne({ id, id_server });
  res.json({ posts });
});


app.post('/delete-post', async (req, res) => { 
  const { id_server, hash, hash_post } = req.body
  await usersAppDB.updateOne({ hash, "posts.id": hash_post }, { $pull: { posts: { id: hash_post } } });
  const URL_MY_LOGIN = await serversDB.findOne({ id_server });
  await axios.post(`${URL_MY_LOGIN.url}/api/delete-post`,  { hash_post, hash }, { headers: { "Content-Type": "application/json" } });
  const { posts } = await usersAppDB.findOne({ hash });
  res.json({ posts });
});






app.post("/api/parse", async (req, res) => {
  const { title } = req.body;
  axios.get(`https://t.me/${title}`).then(async (raw) => {
    const root = HTMLParser.parse(raw.data);
    res.json({
      type: root.querySelector(".tgme_page_photo_image") ? 'success' : 'error',
      img: root.querySelector(".tgme_page_photo_image")?._attrs?.src,
      title: root.querySelector(".tgme_page_title")?.innerText?.trim()
    });
  })
});




function hashCode(n = 8) {
  const symbols =
    "QWERTYUIOPASDFGHJKLZXCVBNMqwertyuiopasdfghjklzxcvbnm1234567890";
  let user_hash = "";
  for (let i = 0; i != n; i++) {
    user_hash += symbols[Math.floor(Math.random() * symbols.length)];
  }
  return user_hash;
}

async function verifyTelegramInitData(initData) {
  const urlParams = new URLSearchParams(initData);
  const hash = urlParams.get("hash");
  urlParams.delete("hash");
  const dataCheckString = Array.from(urlParams.entries()).map(([k, v]) => `${k}=${v}`).sort().join("\n");
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const hmac = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  return hmac === hash;
}

async function sendToTelegram(id, text, image) {
  if(image){
    return await axios.post(`${process.env.URL_BOT}/telegram/send-photo`,  { id, image, text }, { headers: { "Content-Type": "application/json" } });
  }else{
    return await axios.post(`${process.env.URL_BOT}/telegram/send-text`,  { id, text }, { headers: { "Content-Type": "application/json" } });
  }
}


app.listen(3042, (err) => { err ? err : console.log("STARTED SERVER"); });

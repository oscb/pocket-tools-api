const fs = require('fs');
const path = require('path');
const assert = require('assert');
const request = require('request');
const _ = require('lodash');
const promisify = require('util').promisify;
const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);
const fileStat = promisify(fs.stat);

const jsdom = require("jsdom");
const readability = require('readability');
const periodical = require('kindle-periodical');
const parseArgs = require('minimist');
const Pocket = require('pocket-promise');
const { extract } = require('article-parser');
const sendGrid = require('@sendgrid/mail');
const { createCanvas, loadImage } = require('canvas');
const moment = require('moment');

const config = require('./config.json');


const { JSDOM } = jsdom;
const { Readability } = readability;

function getTemplate (filename) {
  let filePath = path.join(__dirname, 'templates', filename);
  
  return readFile(filePath, {
    encoding: 'UTF-8'
  });
}

const MAX_QUERIES = 5;
const WPM = 230;

function ExecuteQuery (user, query) {
  const pocket = new Pocket({
    consumer_key: config.pocket_key, 
    access_token: user.token
  });

  let queryCount = (i == 0 && query.countType === 'count') ? query.count : 20;
  let pocketQuery = {
    offset: i * queryCount,
    count: queryCount,
    sort: query.orderBy,
    detailType: 'complete',
  };
  if (query.domain != null) defaultQuery.domain = query.domain;

  let count = 0;
  let i = 0;

  while(count < query.count && i <= MAX_QUERIES) {
    let articles = await pocket.get({...pocketQuery});

    if (articles.error) throw articles.error;
    if (articles.list.length === 0) break;
    
    let tmp = [];
    for (const article_id in articles.list) {
      tmp.push(articles.list[article_id]);
    }
    articles = tmp.sort((a, b) => a.sort_id - b.sort_id);

    for(const article of articles) {
      if (article.has_video != "0") continue;
      if (query.tagsMode === 'exclude' && article.tags != null) {
        let blacklisted = false;
        if (article.tags) {
          for(let tag of query.tags) {
            if (tag in article.tags) {
              blacklisted = true;
              break;
            }
          }
        }
        if (blacklisted) {
          console.log(`~ ${article.resolved_title}`);
          continue;
        }
      }
      
      if (query.tagsMode === 'include') {
        if (article.tags === null) {
          console.log(`~ ${article.resolved_title}`);
          continue;
        }
        
        let blacklisted = true;
        if (article.tags) {
          for(let tag in article.tags) {
            if (tag in query.tags) {
              blacklisted = false;
            }
          }
          if (blacklisted) {
            console.log(`~ ${article.resolved_title}`);
            continue;
          } 
        }
      }
      
      console.log(`+ ${article.resolved_title}`);
      filteredArticles.push(article);
      count += (query.countType === 'count') ? 1 : (article.word_count/WPM)
      if (count > query.count) {
        break;
      }
    }
    i++;
  }
  return filteredArticles;
}

function SendDelivery(query, ...opts) {
  let filteredArticles = ExecuteQuery(query);

  const contentTemplate = _.template(await getTemplate('article.html'));
  let articlesData = [];
  for(let article of filteredArticles) {
    let parsedArticle;
    let url = article.resolved_url != null ? article.resolved_url : article.given_url;
    if (opts.parser === 'mozilla') {
      const dom = await JSDOM.fromURL(url, { userAgent: "Mozilla/5.0" });
      Node = dom.window.Node;
      let articleRaw = new readability(url, dom.window.document).parse();
      parsedArticle = {
        title: articleRaw.title,
        author: articleRaw.byline,
        content: articleRaw.content,
        url: articleRaw.uri,
      };
    } else {
      let articleRaw = await extract(article.resolved_url);
      parsedArticle = {
        title: articleRaw.title,
        author: articleRaw.author,
        content: articleRaw.content,
        url: articleRaw.url,
      };
    }
    let contents = contentTemplate({ ...parsedArticle });
    
    articlesData.push({
      "title"  : parsedArticle.title,
      "author" : parsedArticle.author,
      "content": contents,
    });
  }
  
  const now = moment();

  // TODO: When deploying need to
  // - Bundle the font
  // - Verify this actually works! since it requires cairo installed locally

  // Creating a cover programmatically
  const canvas = createCanvas(938, 1500);
  const ctx = canvas.getContext('2d');

  // Draw cat with lime helmet
  var image = await loadImage(path.join(__dirname, 'PocketToolsCover.jpg'));
  ctx.drawImage(image, 0, 0, 938, 1500);

  // Write Date
  ctx.font = '76px Alegreya Sans';
  ctx.fillStyle = '#ffffff';
  // TODO: Since Kindle already shows date, this should be the name of your delivery instead
  ctx.fillText(`${now.format('ll')}`, 45, 380); 
  
  // Put line divider
  ctx.strokeStyle = 'rgba(1,1,1,0.5)';
  ctx.lineWidth=5;
  ctx.beginPath();
  ctx.lineTo(38, 280);
  ctx.lineTo(520, 280);
  ctx.stroke();

  let stream = canvas.jpegStream({
      bufsize: 4096 // output buffer size in bytes, default: 4096
    , quality: 75 // JPEG quality (0-100) default: 75
    , progressive: true // true for progressive compression, default: false
  });
  let coverPath = path.join(__dirname, 'Edited_PocketToolsCover.jpg');
  let jpg = fs.createWriteStream(coverPath);
  await stream.pipe(jpg);

  // Create Periodical
  const fileName = `PocketDelivery[${now.format('YY-MM-DD')}]`;
  const bookData = {
    "title"         : `Pocket Delivery - ${now.format('ll')}`, 
    "creator"       : 'Pocket Tools',
    "publisher"     : 'Pocket Tools',
    "language"      : 'en-us',
    "cover"         : coverPath,
    "description"   : 'Articles fresh from your pocket',
    "sections"      : [{
      "title" : 'Articles',
      "articles"  : articlesData
    }]
  };
  
  let created = await periodical.create(
    bookData, 
    {
      targetFolder: '.',
      filename: fileName,
    });
  
  // Send with sendgrid
  let data = await readFile(path.join(__dirname, 'book', `${fileName}.mobi`));

  sendGrid.setApiKey(config.sendgrid_token);
  const msg = {
    to: config.test_kindle_email,
    bcc: config.test_from_email,
    from: config.test_from_email,
    subject: 'Pocket Tools Delivery!',
    text: 'Pocket Delivery!',
    attachments: [
      {
        content: data.toString('base64'),
        filename: 'PocketTools.mobi',
        type: 'application/x-mobipocket-ebook',
        disposition: 'attachment',
        contentId: 'book'
      },
    ],
  };
  var response = await sendGrid.send(msg);

  return true;
}
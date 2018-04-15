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

var config = require('./config.json')
const { test_from_email, test_kindle_email, sendgrid_token, ...pocketConf } = { ...config };


const { JSDOM } = jsdom;
const { Readability } = readability;

function getTemplate (filename) {
  let filePath = path.join(__dirname, 'templates', filename);
  
  return readFile(filePath, {
    encoding: 'UTF-8'
  });
}

const start = async function () {
  // Default options
  let opts = {
    orderBy:'newest',
    countBy: 'time',
    count: 60,
    parser: 'mozilla',
    mode: 'exclude',
    domain: null,
    tags: null
  };
  
  // Params parsing
  const args = parseArgs(process.argv.slice(2));
  if ('h' in args || '?' in args) {
    console.log("Args: [-s: new | old ] [-c: count | time ] [-n: number] [-p: mozilla | npm] [-m: exclude | include ] [-d: domain] [tags]");
    return;
  }
  
  if ('s' in args) opts.orderBy = (args['s'].trim() == 'new') ? 'newest' : 'oldest';
  if ('c' in args) opts.countBy = args['c'].trim();
  if ('n' in args) opts.count = args['n'].trim();
  if ('p' in args) opts.parser = args['p'].trim();
  if ('m' in args) opts.mode = args['m'].trim();
  if ('d' in args) opts.domain = args['d'].trim();
  if ('_' in args) opts.tags = args['_'].map(x => x.trim().replace(/['"]+/g, ''));
  
  // Connect to pocket
  const pocket = new Pocket(pocketConf);
  
  let filteredArticles = [];
  const MAX_QUERIES = 5;
  const WPM = 230;
  let count = 0;
  let i = 0;
  while(count < opts.count && i <= MAX_QUERIES) {
    // Retrieve Articles
    let queryCount = (i == 0 && opts.countBy === 'count') ? opts.count : 20;
    let defaultQuery = {
      offset: i * queryCount,
      count: queryCount,
      sort: opts.orderBy,
      detailType: 'complete',
    };
    if (opts.domain != null) defaultQuery.domain = opts.domain;

    let articles = await pocket.get({...defaultQuery});
    if (articles.error) throw articles.error;
    if (articles.list.length === 0) break;
    
    for(const article_id in articles.list) {
      const article = articles.list[article_id];
      if (article.has_video != "0") continue;
      if (opts.mode === 'exclude' && article.tags != null) {
        let blacklisted = false;
        for(let tag of opts.tags) {
          if (tag in article.tags) {
            blacklisted = true;
            break;
          }
        }
        if (blacklisted) continue;
      }
      
      if (opts.mode === 'include') {
        if (article.tags === null) {
          continue;
        }
        
        let blacklisted = true;
        for(let tag of article.tags) {
          if (tag in opts.tags) {
            blacklisted = false;
          }
        }
        if (blacklisted) continue;
      }
      
      filteredArticles.push(article);
      count += (opts.mode === 'count') ? 1 : (article.word_count/WPM)
      if (count > opts.count) {
        break;
      }
    }
    i++;
  }
  
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
  
  var fileName = `PocketDelivery[${opts.parser}]`;
  // Create Periodical
  var bookData = {
    "title"         : 'Pocket Delivery', // TODO: Add date
    "creator"       : 'Pocket Tools',
    "publisher"     : 'Pocket Tools',
    // "subject"       : 'subject',
    "language"      : 'language (en-US)',
    "cover"         : "/Users/oscb/Projects/PocketToolsNodeAPI/PocketToolsCover.jpg",
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
  let data = await readFile(`book/${fileName}.mobi`);

  sendGrid.setApiKey(sendgrid_token);
  const msg = {
    to: test_kindle_email,
    bcc: test_from_email,
    from: test_from_email,
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
}

if (require.main === module) {
  start();
}
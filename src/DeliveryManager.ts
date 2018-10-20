import * as fs from 'fs';
import { JSDOM } from "jsdom";
import _ from "lodash";
import * as path from 'path';
import { promisify } from 'util';
import { Query, CountType } from "./Delivery";
import { User } from "./User";
import sgMail from "@sendgrid/mail"
import { Glob } from 'glob';
import dayjs from 'dayjs';
import { MailData } from '@sendgrid/helpers/classes/mail';

const readability = require('readability');
const periodical = require('kindle-periodical');
const Pocket = require('pocket-promise');
const { extract } = require('article-parser');

const readFile = promisify(fs.readFile);
const MAX_QUERIES = 5;
const WPM = 230;

function getTemplate (filename) {
  let filePath = path.join(__dirname, '../', 'templates', filename);
  
  return readFile(filePath, {
    encoding: 'UTF-8'
  });
}

export const ExecuteQuery = async (user: User, query: Query) => {
  const pocket = new Pocket({
    consumer_key: process.env.POCKET_KEY, 
    access_token: user.token
  });

  let filteredArticles: any[] = [];
  let count = 0;
  let i = 0;
  let queryCount = (i == 0 && query.countType === CountType.Count) ? query.count : 20;

  // TODO: Type Pocket Query
  let defaultQuery: any = {
    sort: query.orderBy,
    // Needs to be complete because it cannot do the exclusion correctly with simple (doesn't contain tags)
    detailType: 'complete',
  };
  if (query.domain != null) defaultQuery.domain = query.domain;

  while(count < query.count && i <= MAX_QUERIES) {
    let pocketQuery = { 
      offset: i * queryCount,
      count: queryCount,
      ...defaultQuery
    };
    // TODO: Type articles from pocket
    let articles = await pocket.get({...pocketQuery});

    if (articles.error) throw articles.error;
    if (articles.list.length === 0) break;
    
    let tmp: any[] = [];
    for (let article_id in articles.list) {
      tmp.push(articles.list[article_id]);
    }
    articles = tmp.sort((a, b) => a.sort_id - b.sort_id);

    for(let article of articles) {
      if (article.has_video !== "0") continue;

      let included = false;
      if (query.includedTags !== undefined && query.includedTags.length > 0) {
        if (article.tags) {
          for(let tag in article.tags) {
            if (tag in query.includedTags) {
              included = true;
              break;
            }
          }
        }
      } else {
        included = true;
      }
      if (!included) continue;

      let excluded = false;
      if (query.excludedTags !== undefined && query.excludedTags.length > 0) {
        if (article.tags) {
          for(let tag of query.excludedTags) {
            if (tag in article.tags) {
              excluded = true;
              break;
            }
          }
        }
      }
      if (excluded) continue;

      if (query.longformOnly) {
        // TODO: Use property in article
        if (article.word_count/WPM < 20) {
          continue;
        }
      }
      
      console.log(`+ ${article.resolved_title}`);
      filteredArticles.push(article);
      count += (query.countType === CountType.Count) ? 1 : (article.word_count/WPM)
      if (count > query.count) {
        break;
      }
    }
    i++;
  }
  return filteredArticles;
};

export const SendDelivery = async (email: string, articles: any, ...opts: any[]) => {
  try {
    // TODO: Generate links? How does ID comes?
    const contentTemplate = _.template(await getTemplate('article.html'));
  
    let articlesData: any = [];
    for(let article of articles) {
      let parsedArticle;
      let url = article.resolved_url != null ? article.resolved_url : article.given_url;
      if (opts['parser'] === 'mozilla') {
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
      let contents = contentTemplate({ 
        ...parsedArticle,  
        fav_url: `${process.env.URL_PREFIX}/deliveries/articles/${article.id}/favorite`,
        archive_url: `${process.env.URL_PREFIX}/deliveries/articles/${article.id}/archive`,
        fav_and_archive_url: `${process.env.URL_PREFIX}/deliveries/articles/${article.id}/fav-and-archive`
      });
      
      articlesData.push({
        "title"  : parsedArticle.title,
        "author" : parsedArticle.author,
        "content": contents,
      });
    }
  
    // TODO: Add extra page for Archive all
  
    const coverPath = path.join(__dirname, '../', 'PocketToolsCover.jpg');
    // TODO: Can Use the CoverCreator to create custom covers, but might not work deployed in a Function env
    const now = dayjs();
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
    const lastPub = path.join(__dirname, '../', `${fileName}.mobi`);
    const tmpBookDir = path.join(__dirname, '../', `book`);
    let data = await readFile(lastPub);
    
    const msg: MailData = {
      to: email, 
      bcc: process.env.FROM_EMAIL, // TODO: Remove
      from: process.env.FROM_EMAIL!,
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
    sgMail.setApiKey(process.env.SENDGRID_TOKEN!);
    var response = await sgMail.send(msg);
    return (response[0].statusCode === 202);
  } catch(err) {
    console.error(err);
  } finally {
    cleanup();
  }
  return false;
};

function cleanup() {
  const tmpBookDir = path.join(__dirname, '../', `book`);

  if (fs.existsSync(tmpBookDir)) {
    fs.readdir(tmpBookDir, (err, files) => {
      if(!err) {
        for(let file of files) {
          console.log(`- Deleting ${file}`);
          fs.unlinkSync(path.join(tmpBookDir,file));
        }
      }
    });
    // This is throwing an error that folder isn't empty, even if it is.
    // fs.rmdirSync(tmpBookDir);
  }

  // fs.unlinkSync(`${__dirname}/Edited_PocketToolsCover.jpg`);
  new Glob(`${__dirname}/*.mobi`, {}, (err, files)=>{
    for(let file of files) {
      console.log(`- Deleting ${file}`);
      fs.unlinkSync(file);
    }
  });
}
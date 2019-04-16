import _ from "lodash";
import * as path from 'path';
import { asyncReadFile } from "./asyncReadFile";

function loadTemplate(filename) {
  let filePath = path.join(__dirname, '../', 'templates', filename);
  
  return asyncReadFile(filePath, {
    encoding: 'UTF-8'
  });
}

const getTemplate = ((fileName: string) => {
  let template: _.TemplateExecutor;
  return async () => {
    if (template === undefined) {
      template = _.template(await loadTemplate(fileName));
    }
    return template;
  }
});

export const getArticleTemplate = getTemplate('article.html');
export const getControlsTemplate = getTemplate('controls.html');
import * as fs from 'fs';
import { promisify } from "util";

export const asyncReadFile = promisify(fs.readFile);
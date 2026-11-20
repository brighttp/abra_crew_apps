import {connection} from './src/config/environment.js';
export default {client:'mysql2',connection,pool:{min:0,max:10},migrations:{directory:'./database/migrations'},seeds:{directory:'./database/seeds'}};

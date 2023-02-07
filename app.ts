import * as moment from "moment";
import * as _ from 'lodash';
import {WebClient} from "@slack/client";
import * as process from "process";
import axios from 'axios';

const {v4: uuidv4} = require('uuid');

const Hapi = require('hapi');
const server = new Hapi.Server({
    host: '0.0.0.0',
    port: 18124
});
require('dotenv').config();
const {CronJob} = require('cron');

if (process.env.REPORT) {

    new CronJob('0 0 10 * * *', () => {
        checkUnCompleteTaskList().then(() => {
        });
    }, null, true, 'Asia/Tokyo');
}

const slackToken = process.env.SLACK_TOKEN;
const todoToken = (process.env.TODOIST_TOKEN as string);
const toChannel = process.env.SLACK_TO_CHANNEL;
const web: WebClient = new WebClient(slackToken);
const watch_users_ids: Array<number | string> = (process.env.WATCH_USER_IDS as string).split(",")
const watch_project_ids: Array<number | string> = (process.env.WATCH_PROJECT_IDS as string).split(",")

axios.defaults.headers.common = {'Authorization': `Bearer ${todoToken}`};

//Projectリストを取得する
let projects: any[] = [];
const poolItems = new Map();

async function syncProject() {
    if (todoToken) {
        const res: { data: { projects: TodoProject[] } } = await axios.get('https://api.todoist.com/sync/v9/sync', {
            params: {
                resource_types: "[\"projects\"]"
            }
        });
        projects = res.data.projects.filter(p => p.shared).filter(p => watch_project_ids.includes(p.id));
        console.log(new Date(), "fetch projects", projects);
    }
}

async function updateItem(args: any) {
    if (todoToken) {
        const uuid = uuidv4();
        const res: { data: { sync_status: { [key: string]: string } } } = await axios.get('https://api.todoist.com/sync/v9/sync', {
            params: {
                commands: JSON.stringify([{type: "item_update", uuid, args}])
            }
        });
        return res;
    }
}

async function checkUnCompleteTaskList() {
    if (todoToken) {
        const res: { data: { collaborators: TodoUser[], items: TodoItem[] } } = await axios.get('https://api.todoist.com/sync/v9/sync', {
            params: {
                resource_types: "[\"items\", \"collaborators\"]"
            }
        });

        const users = new Map();
        res.data.collaborators.filter(user => watch_users_ids.includes(user.id)).forEach(user => {
            if (!users.has(user.id)) {
                users.set(user.id, user);
            }
        });
        const now = moment();
        const groupBy = _.groupBy(res.data.items.filter(item => moment(item.due_date_utc).unix() < now.unix() && item.checked === 0), (item) => item.responsible_uid)
        _.each(groupBy, (items: TodoItem[], userId) => {
            const uid = parseInt(userId, 0);
            const filteredItem = items.filter((item) => projects.findIndex(p => p.id == item.project_id) != -1);
            if (users.has(uid) && filteredItem.length) {
                const u: TodoUser = users.get(uid);
                sendMessage(u.full_name + "さんは、" + filteredItem.length + "件 期限切れタスクがあります。");
            } else {
                // console.log(uid);
            }
        });
    }
}

function sendMessage(msg: any) {
    // @ts-ignore
    web.chat.postMessage({
        channel: toChannel!,
        attachments: [{text: msg}],
        as_user: true,
        icon_emoji: ':todoist:',
        username: 'Todoist Bot'
    }).then((res: any) => {
        console.log('Message sent: ', res.ts);
    }).catch(console.error);
};

server.route({
    method: 'POST',
    path: '/',
    handler: async (request: any, h: any) => {
        // console.log(request.payload);
        // console.log('-------\n');
        const req = request.payload;
        const event = req.event_data;
        let name = req.initiator.full_name;
        if (name.length > 8) {
            name = name.substr(0, 8);
        }
        //追加処理
        if (req.event_name == 'item:added') {
            const p = projects.find(e => e.id == event.project_id);
            if (p) {
                sendMessage(`${name}が、${p.name}に「<${event.url}|${event.content}>」を追加しました。`);
                if (watch_users_ids.includes(event.user_id) && event.responsible_uid == null) {
                    await updateItem({id: event.id, responsible_uid: event.user_id});
                }
            }
        } else if (req.event_name == 'item:completed') {
            const p = projects.find(e => e.id == event.project_id);
            if (p) {
                // sendMessage(`${name}が、` + p.name + " の「" + event.content + "」を完了しました！")
            }
        } else if (req.event_name.match(/^project\:/)) {
            await syncProject();
        } else if (req.event_name == 'item:updated') { // タスクが追加された時にprojectが移動していたら通知を行う
            const todoItemUpdateRequest = (req as TodoItemUpdateEvent);
            const todoItemUpdateEventData = todoItemUpdateRequest.event_data;


            if (!poolItems.has(todoItemUpdateEventData.id)) {
                poolItems.set(todoItemUpdateEventData.id, todoItemUpdateEventData.sync_id);
            } else {
                const sync_id = poolItems.get(todoItemUpdateEventData.id);
                if (sync_id != todoItemUpdateEventData.sync_id && todoItemUpdateEventData.sync_id != null) {
                    const p = projects.find(e => e.id == todoItemUpdateEventData.project_id);
                    if (p) {
                        sendMessage(`${name}が、${p.name}に「<${event.url}|${event.content}>」を移動しました。`);
                    }
                } else {
                    poolItems.set(todoItemUpdateEventData.id, todoItemUpdateEventData.sync_id);
                }
            }

        }

        return h.response().code(204);
    }
})

// Start the server
const start = async function () {
    try {
        await syncProject();
        await server.start();

        // 定期的にpoolItemsを初期化する
        setInterval(() => {
            poolItems.clear();
        }, 30000)
    } catch (err) {
        console.log(err);
        process.exit(1);
    }

    console.log('Server running at:', server.info.uri);
};

const testFunc = async function () {
    try {
        console.log(await updateItem({id: "4146449908", responsible_uid: "14421183"}));
    } catch (err) {
        console.log(err);
        process.exit(1);
    }
};

// testFunc();
start();

import * as moment from "moment";
import * as _ from 'lodash';

const Hapi = require('hapi');
const server = new Hapi.Server({
  host: '0.0.0.0',
  port: 18124
});
require('dotenv').config();
const {CronJob} = require('cron');

new CronJob('0 0 10 * * *', () => {
  checkUnCompleteTaskList().then(() => {
  });
}, null, true, 'Asia/Tokyo');

const axios = require('axios');
const {WebClient} = require('@slack/client');

const slackToken = process.env.SLACK_TOKEN;
const todoToken = (process.env.TODOIST_TOKEN as string);
const toChannel = process.env.SLACK_TO_CHANNEL;
const web = new WebClient(slackToken);


//Projectリストを取得する

let projects: any[] = [];
const poolItems = new Map();

async function syncProject() {
  if (todoToken) {
    const res: { data: { projects: TodoProject[] } } = await axios.get('https://todoist.com/api/v7/sync', {
      params: {
        token: todoToken,
        resource_types: "[\"projects\"]"
      }
    });
    projects = res.data.projects.filter((e) => {
      return e.shared;
    });
    // console.log(projects);
    console.log(new Date(), "fetch projects");
  }
}

async function checkUnCompleteTaskList() {
  if (todoToken) {
    const res: { data: { collaborators: TodoUser[], items: TodoItem[] } } = await axios.get('https://todoist.com/api/v7/sync', {
      params: {
        token: todoToken,
        resource_types: "[\"items\", \"collaborators\"]"
      }
    });

    const users = new Map();
    res.data.collaborators.forEach(user => {
      if (!users.has(user.id)) {
        users.set(user.id, user);
      }
    });
    // console.log(users);
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
  web.chat.postMessage({
    channel: toChannel,
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
  handler: (request: any, h: any) => {
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
      }
    } else if (req.event_name == 'item:completed') {
      const p = projects.find(e => e.id == event.project_id);
      if (p) {
        sendMessage(`${name}が、` + p.name + " の「" + event.content + "」を完了しました！")
      }
    } else if (req.event_name.match(/^project\:/)) {
      syncProject();
    } else if (req.event_name == 'item:updated') { // タスクが追加された時にprojectが移動していたら通知を行う
      const todoItemUpdateRequest = (req as TodoItemUpdateEvent);
      const todoItemUpdateEventData = todoItemUpdateRequest.event_data;


      if (!poolItems.has(todoItemUpdateEventData.id)) {
        poolItems.set(todoItemUpdateEventData.id, todoItemUpdateEventData.sync_id);
      } else {
        const sync_id = poolItems.get(todoItemUpdateEventData.id);
        if(sync_id != todoItemUpdateEventData.sync_id && todoItemUpdateEventData.sync_id != null){
          const p = projects.find(e => e.id == event_data.project_id);
          if (p) {
            sendMessage(`${name}が、${p.name}に「<${event.url}|${event.content}>」を追加しました。`);
          }
        }else{
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

start();

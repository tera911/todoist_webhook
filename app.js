'use strict'

const Hapi = require('hapi');
const server = new Hapi.Server({
    host: '0.0.0.0',
    port: 18124
});


const axios = require('axios');
const { WebClient } = require('@slack/client');

const slackToken = process.env.SLACK_TOKEN;
const todoToken = process.env.TODOIST_TOKEN;
const toChannel = process.env.SLACK_TO_CHANNEL;
const web = new WebClient(slackToken);

//Projectリストを取得する

let projects = [];

async function syncProject(){
    if(todoToken){
        const res = await axios.get('https://todoist.com/api/v7/sync', {
            params: {
                token: todoToken,
                resource_types: "[\"projects\"]"
            }
        });
        projects = res.data.projects.filter((e)=>{
            return e.shared;
        });
        console.log(new Date(), "fetch projects");
    }
}

function sendMessage(msg){
    web.chat.postMessage({channel: toChannel, 
        attachments: [{text: msg}], 
        as_user: true,
        icon_emoji: ':todoist:',
        username: 'Todoist Bot'
    }).then((res) => {
        console.log('Message sent: ', res.ts);
    }).catch(console.error);
};

server.route({
    method: 'POST',
    path: '/',
    handler: (request, h) => {
        // console.log(request.payload);
        // console.log('-------\n');
        const req = request.payload;
        const event = req.event_data;
        let name = req.initiator.full_name;
        if(name.length > 8){
            name = name.substr(0,8);
        }
        //追加処理
        if(req.event_name == 'item:added'){
            const p = projects.find(e => e.id == event.project_id);
            if(p){
                sendMessage(`${name}が、${p.name}に「<${event.url}|${event.content}>」を追加しました。`);
            }
        }else if(req.event_name == 'item:completed'){
            const p = projects.find(e => e.id == event.project_id);
            if(p){
                sendMessage(`${name}が、` + p.name + " の「"+event.content+"」を完了しました！")
            }
        }else if(req.event_name.match(/^project\:/)){
            syncProject();
        }
        
        return h.response().code(204);
    }
})

// Start the server
const start =  async function() {
    try {
        await syncProject();
        await server.start();
    }
    catch (err) {
        console.log(err);
        process.exit(1);
    }

    console.log('Server running at:', server.info.uri);
};

start();
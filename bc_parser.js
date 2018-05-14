/*###############################################################################  
# 
# EOS TestNet Monitor 
#
# Created by http://CryptoLions.io  
#
# Git Hub: https://github.com/CryptoLions/EOS-Testnet-monitor
#
###############################################################################  */

module.exports = {
  init: init,
  reinit: reinit,
  connected: connected,
  disconnected: disconnected,
  getStats: getStats,
  getProducers: getProducers,
  getNodeInfo: getNodeInfo,
  CheckNewBlocksTimer: CheckNewBlocksTimer,
  getBlockInfo: getBlockInfo,
  processBlock: processBlock,
  processTransaction: processTransaction,
  updateSTATS: updateSTATS,
  updateProducer: updateProducer,
  updateAccount: updateAccount,
  addTransactions: addTransactions,
  APIrequest: APIrequest,
  CheckNewTelegramUsers: CheckNewTelegramUsers,
  telegramRequest: telegramRequest,
  updateTelegramUsres: updateTelegramUsres,
  getNodes: getNodes,
  processTelegramUpdate: processTelegramUpdate,
  sendTelegramMessage: sendTelegramMessage,
  nodeDownAlarm: nodeDownAlarm,
  nodeUpNotification: nodeUpNotification,
  getTransactions: getTransactions,
  announceMsg: announceMsg,


  test: 0
}

function reinit(){
    this.STATS = {};
    this.PRODUCERS = {};
    this.TXS = {};

    this.LAST_GETINFG = {};
    this.NODES = [];

    this.statsLoaded = false;
	this.producersLoaded = false;
	this.nodesLoaded = false;


	this.getNodes();
	this.getStats();
	this.getProducers();

    this.nodeDownCount = {};
}

function init(data){

    this.connections = 0;
    this.connections_data = {};
    this.data = data;
    this.blockProcessing = -1;
	this.LastCheckedNode = -1;
	this.LastCheckedNodePing = {};
	this.LastTelegramNotify = {};
	this.LastTransactions = [];

    this.LastTXLoaded = false;

    this.reinit();
    this.getNodeInfo(this, this.data.CONFIG.nodeAddr, this.LastCheckedNode);

	this.interval_main_loop = setInterval(mainLoop, this.data.CONFIG.mainLoopInterval, this);
	this.interval_blockcheck = setInterval(CheckNewBlocksTimer, this.data.CONFIG.blockCheckInterval, this);

   	if (this.data.CONFIG.TELEGRAM_API.enabled)
		this.interval_telegramm = setInterval(CheckNewTelegramUsers, this.data.CONFIG.TelegramCheckInterval, this);

	//var msgObject = {"c1": blocknum, "c2": action.name};
	var th = this;
	this.getTransactions(this, 0, 6, function(this_, res){
    	th.LastTransactions = res.reverse();
    	th.LastTXLoaded = true;
        console.log(res);
	});
	//clearInterval(interval);
}



function mainLoop(this_){

	if (!this_.statsLoaded) return;
	if (!this_.producersLoaded) return;
	if (!this_.nodesLoaded) return;
	if (!this_.LastTXLoaded) return;

    //this_.announceMsg(this_, "console", this_.data.CONFIG.hook);

    this_.LastCheckedNode++;
    if (this_.LastCheckedNode >= this_.NODES.length)
    	this_.LastCheckedNode = 0;

	var addr = this_.NODES[this_.LastCheckedNode].node_addr;
    var port = this_.NODES[this_.LastCheckedNode].port_http;

    this_.getNodeInfo(this_, addr+":"+port, this_.LastCheckedNode);


}

function CheckNewBlocksTimer(this_){
    if (!this_.statsLoaded) return;
    if (!this_.producersLoaded) return;
    if (!this_.nodesLoaded) return;

	var lastblockinfo = this_.LAST_GETINFG.head_block_num;
	//var lastblockinfo = 9500;


    if (this_.blockProcessing > 0 ) return;

	if (this_.STATS.lastBlock < lastblockinfo){
        var nextBlocknum = this_.STATS.lastBlock + 1;
		this_.blockProcessing = nextBlocknum;
		this_.getBlockInfo(this_, this_.data.CONFIG.nodeAddr, nextBlocknum);
	}

}

function announceMsg(this_, action, msg){
	if (this_.connections>0) {
		var r = -1;
		this_.data.io.emit(action, msg);
		//console.log("OK");
	}
}

function connected(socket){

	socket.emit("initNodes", this.NODES);

    //console.log(this.NODES);

	this.connections_data[socket.id] = socket;
	this.connections++;



	//socket.emit("blockupdate", this.STATS.lastBlock);
	socket.emit("get_info", this.LAST_GETINFG);
	socket.emit("initProducersStats", this.PRODUCERS);
    this.announceMsg(this, "usersonline", this.connections);

    var ltx = this.LastTransactions;
	for (var t in ltx){
		socket.emit("transaction", ltx[t].msgObject);
	}



	//console.log('bc_conn '+this.connections);
}


function disconnected(socket){
	this.connections--;
	delete this.connections_data[socket.id];
	this.announceMsg(this, "usersonline", this.connections);
}


function test(){
}




function getNodeInfo(this_, ipaddr, nodeid){
	var url = "http://"+ipaddr + this_.data.EOSAPI.api_get_info;
	//var url = "http://127.0.0.1:8898/v1/chain/get_info";
    this_.LastCheckedNodePing[nodeid] = new Date().getTime();

	this_.announceMsg(this_, "ping", {nodeid: nodeid});

	this_.data.request({url: url, json: true, timeout: 40000}, function (error, response, body) {
	    if (!error && response.statusCode === 200 ) {
	        //console.log(body); // Print the json response
	        this_.LAST_GETINFG = body;
	        body.nodeid = nodeid;
	        body.ping = new Date().getTime() - this_.LastCheckedNodePing[nodeid];
	        body.txs = this_.STATS.total_tx_count;
            body.txblocks = this_.STATS.total_txblocks_count;
            //console.log('Ping: '+body.ping);
	        this_.announceMsg(this_, "get_info", body);

            if (this_.data.CONFIG.TELEGRAM_API.enabled && this_.NODES[nodeid]){
            	this_.nodeDownCount[this_.NODES[nodeid].bp_name] = 0;
            	this_.nodeUpNotification(this_, this_.NODES[nodeid].bp_name);
            }
	    } else {
	 		this_.announceMsg(this_, "error_node", nodeid);
	 		//this_.NODES[nodeid].bp_name
            if (this_.data.CONFIG.TELEGRAM_API.enabled) {
            	if (!this_.nodeDownCount[this_.NODES[nodeid].bp_name]) this_.nodeDownCount[this_.NODES[nodeid].bp_name] = 0;

            	if (this_.nodeDownCount[this_.NODES[nodeid].bp_name] >= this_.data.CONFIG.TELEGRAM_API.tryToCheckBeforeSend-1) {
            		this_.nodeDownAlarm(this_, this_.NODES[nodeid].bp_name);
            		this_.nodeDownCount[this_.NODES[nodeid].bp_name] = 0;
            	} else {
            		this_.nodeDownCount[this_.NODES[nodeid].bp_name]++;
            	}
            }
	    }

	});

}

function getBlockInfo(this_, ipaddr, blocknum){
	var url = "http://"+ipaddr + this_.data.EOSAPI.api_get_block;
	//var url = "http://127.0.0.1:8898/v1/chain/get_info";
	this_.data.request.post({
			headers: {	'content-type' : 'application/x-www-form-urlencoded'},
			url: url,
			body: '{"block_num_or_id": '+blocknum+'}',
			json: true
		}, function (error, response, body) {

		    if (!error && response.statusCode === 200) {
	            this_.processBlock(this_, blocknum, body);
		        //console.log(body); // Print the json response
		        //this_.LAST_GETINFG = body;

		    } else {
		    	//ERROR BED BLOCK !!!!!!!!!!!!!!
		    	//console.log("ERROR: "+blocknum);
		    	this_.STATS.lastBlock = blocknum;
		    	this_.blockProcessing = -1;

		    }
		}
	);

}


function processBlock(this_, blocknum, block){

	this_.announceMsg(this_, "blockupdate", block);

	//this_.announceMsg(this_, "chat message", JSON.stringify(block) );

	this_.STATS.lastBlock = block.block_num;
    //this_.STATS.lastIrrBlock = block.
    //this_.STATS.lastProducer = block.producer
    //this_.STATS.lastDate = block.timestamp
    //console.log(block);

	if (this_.PRODUCERS[block.producer]){
		this_.PRODUCERS[block.producer].produced += 1;
		this_.PRODUCERS[block.producer].tx_count += block.transactions.length;
		this_.PRODUCERS[block.producer].tx_sum += 0;  //!!!! ADD SUMS
	} else {
		this_.PRODUCERS[block.producer] = {};
		this_.PRODUCERS[block.producer].produced = 1;
		this_.PRODUCERS[block.producer].tx_count = block.transactions.length;
		this_.PRODUCERS[block.producer].tx_sum = 0;  //!!!! ADD SUMS
	}

	this_.updateProducer(this_, block.producer, {name: block.producer, produced: this_.PRODUCERS[block.producer].produced, tx_count: this_.PRODUCERS[block.producer].tx_count, tx_sum: this_.PRODUCERS[block.producer].tx_sum});
	this_.announceMsg(this_, "blockprod_update", this_.PRODUCERS[block.producer]);


    if (block.transactions.length > 0){
    	this_.STATS.total_txblocks_count ++;

    	this_.STATS.total_tx_count += block.transactions.length;

        this_.processTransaction(this_, block.block_num, block);

        //console.log(this_.PRODUCERS);
    	//console.log('-----------------------------');
    	//console.log(block.input_transactions);
    	//console.log('-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=');
    	//console.log(block.input_transactions[0].data.actions);
    	//console.log('==============================');
    	//console.log(JSON.stringify(block.input_transactions));
    	//console.log('');
    	///console.log('');


    }

    this_.updateSTATS(this_);

}

function processTransaction(this_, blocknum, block){
	var txs = block.transactions;
    //console.log(txs);

	for (var t in txs) {
		var tx = txs[t];
		var txs_id = "";

        var msgObject = {"c1": blocknum, "c2": tx.status};
		msgObject.c3 = "cpu:";
        msgObject.c4 = tx.cpu_usage_us;
        msgObject.c5 = "net:";
        msgObject.c6 = tx.net_usage_words

        var txInfo = {txid: txs_id, "block": blocknum, "status": tx.status, "cpu_usage_us": tx.cpu_usage_us, "net_usage_words": tx.net_usage_words, "msgObject": msgObject};
        this_.addTransactions(this_, txInfo);

        //this_.LastTransactions.unshift(txInfo);
        this_.LastTransactions.push(txInfo);
        if (this_.LastTransactions.length > 8) {
            this_.LastTransactions.shift();
        }

        this_.announceMsg(this_, "transaction", msgObject);
	}

}



function updateSTATS(this_){
	var newvalues = { $set: this_.STATS };
	var th = this_;
	this_.data.dbo.collection("stats").updateOne({ id: 1 }, newvalues, {upsert: true}, function(err, res) {
		if (err) throw err;
		//console.log("1 document updated");
		this_.blockProcessing = -1;
		//th.data.db.close();
	});

}

function updateProducer(this_, name, data){

	var newvalues = { $set: data };
	var th = this_;
	this_.data.dbo.collection("producers").update({ name: name }, newvalues, {upsert: true});

}

function updateAccount(this_, name, data){
	//var newvalues = { $set: data };
	var th = this_;
	this_.data.dbo.collection("accounts").update({ name: name }, data, {upsert: true});
}

function addTransactions(this_, data){
	//var newvalues = { $set: data };
	//var th = this_;
	this_.data.dbo.collection("transactions").insert(data);
}




function getStats(){
	var th = this;

	this.data.dbo.collection("stats").findOne({id:1}, function(err, result) {
    	if (err) throw err;

        if (!result) result = { id: 1, lastBlock: 0, total_tx_count: 0, total_txblocks_count: 0, tx_sum: 0, lastTelegramUpd_last: 0 };
    	th.STATS = result;
    	th.statsLoaded = true;

  	});
}


function getProducers(){
	var th = this;

	this.data.dbo.collection("producers").find({}).toArray(function(err, result) {
    	if (err) throw err;
    	//th.PRODUCERS = result;
    	for (var k in result){
    		th.PRODUCERS[result[k].name] = result[k];
    	}
    	//console.log(th.PRODUCERS);
    	th.producersLoaded = true;

    	th.announceMsg(th, "initProducersStats", th.PRODUCERS);
  	});
}

function getNodes(){
	var th = this;

	this.data.dbo.collection("nodes").find({}).sort({"_id":1}).toArray(function(err, result) {
    	if (err) throw err;
    	th.NODES = result;
    	th.nodesLoaded = true;

        th.announceMsg(th, "initNodes", th.NODES);

 		//th.socket.emit("initNodes", th.NODES);
    	//console.log(th.NODES);

  	});
}

function getTransactions(this_, page, countPerPage, callback){

	var th = this_;

	this.data.dbo.collection("transactions").find({}).sort({"_id":-1}).skip( page * countPerPage ).limit(countPerPage).toArray(function(err, result) {
 		callback(th, result);
  	});
}

function APIrequest(msg, socket){  //data = '{"block_num_or_id": '+blocknum+'}'
	var url = "http://"+this.data.CONFIG.nodeAddr + msg.api;

     //console.log(msg);
	//var url = "http://127.0.0.1:8898/v1/chain/get_info";
	this.data.request.post({
			headers: {	'content-type' : 'application/x-www-form-urlencoded'},
			url: url,
			body: msg.data,
			json: true
		}, function (error, response, body) {
		    if (!error && response.statusCode === 200) {
	           socket.emit("api", body);
		    } else {
              socket.emit("api", "error");
		    }
		}
	);
}

//--------------Telegarmm

function CheckNewTelegramUsers(this_){
 	//this.data.CONFIG.Telegram
    var request_data = {url: this_.data.CONFIG.TELEGRAM_API.getUpdates(), data: ""};
 	this_.telegramRequest(request_data, this_, function(error, response, body){
 		if (!error && response.statusCode === 200) {
 			//this_.announceMsg(this_, "console", body);

			this_.processTelegramUpdate(body.result, this_);
			//updateTelegramUsres(this_, chatid, data)

			//socket.emit("api", body);

		} else {
			//socket.emit("api", "error");
		}
 	});
}


function processTelegramUpdate(data, this_){
    var data_upd;

    if (!this_.STATS.lastTelegramUpd_last) this_.STATS.lastTelegramUpd_last = 0;

	for (var i in data) {
		//console.log(data[i].message);
		//console.log(this_.STATS.lastTelegramUpd_last +" < "+  data[i].update_id);

		if (this_.STATS.lastTelegramUpd_last <  data[i].update_id * 1) {
			this_.STATS.lastTelegramUpd_last = data[i].update_id * 1;
			//data[i].message.message_id
			//{fname: ,lname: ,username, lang: , producer, enabled}

			//data[i].message.chat.id



			var text_cmd = data[i].message.text;
			var cmd_arr = text_cmd.split(" ");

			var producers_ = [];
			var enabled = false;
            var isCmd = false;
			if (cmd_arr.length > 1)
				if (cmd_arr[0] == "/init"){
                    isCmd = true;
                    var names = "";
					for (var j=1; j<cmd_arr.length; j++){
						producers_.push(cmd_arr[j]);
                        names += cmd_arr[j] + ", ";
					}
					enabled = true;


					data_upd = { $set: {
							chatid: data[i].message.chat.id,
							first_name: data[i].message.chat.first_name,
							last_name: data[i].message.chat.last_name,
							username: data[i].message.chat.username,
							producer_name: producers_,
							enabled: enabled
							} };
           			this_.updateTelegramUsres(this_, data[i].message.chat.id, data_upd);

					this_.sendTelegramMessage(this_, data[i].message.chat.id, "Your nodes [" + names + "] added to EOS Jungle monitor notification system. \nThank You. To disable type: /disable" + "");
				}
			if (cmd_arr.length > 0) {
				if (cmd_arr[0] == "/enable"){
					isCmd = true;
                	data_upd = { $set: { chatid: data[i].message.chat.id, enabled: true } }
                	this_.updateTelegramUsres(this_, data[i].message.chat.id, data_upd);
                	this_.sendTelegramMessage(this_, data[i].message.chat.id, "Notification System Enabled. ");
				}
				if (cmd_arr[0] == "/disable"){
					isCmd = true;
					data_upd = { $set: { chatid: data[i].message.chat.id, enabled: false } }
                	this_.updateTelegramUsres(this_, data[i].message.chat.id, data_upd);
                	this_.sendTelegramMessage(this_, data[i].message.chat.id, "Notification System Disabled.");
             	}
             	if (!isCmd){
                	this_.sendTelegramMessage(this_, data[i].message.chat.id, "/init <producerName1> [<producerName2> .. ]  - Intit notification for your producers \n/enable - Enable notification for init producers \n/disable - Disable notification for init producers \n/help - This screen ");

             	}
			}

			//console.log(data);
           	//this_.announceMsg(this_, "console", data_upd);

    	}
	}

}

function nodeUpNotification(this_, node_name){

	if (this_.LastTelegramNotify[node_name] > 0) {
		this_.data.dbo.collection("telegram").find({producer_name: {$in: [node_name]} }).toArray(function(err, result) {
			for (var k in result){
	        	if (result[k].enabled){

	    			this_.sendTelegramMessage(this_, result[k].chatid, "You node <b>"+node_name+"</b> is <b>UP</b> again. Thank you " + result[k].first_name + "&parse_mode=html");
					this_.LastTelegramNotify[node_name] = 0;
				}
			}
		});

    }

}

function nodeDownAlarm(this_, node_name){
	var th = this_;

	this_.data.dbo.collection("telegram").find({producer_name: {$in: [node_name]} }).toArray(function(err, result) {
    	if (err) throw err;

         for (var k in result){
         	if (result[k].enabled){
                if (! this_.LastTelegramNotify[node_name])
                	this_.LastTelegramNotify[node_name] = 0;

                if (new Date().getTime() - this_.LastTelegramNotify[node_name] > th.data.CONFIG.TELEGRAM_API.intervalBetweenMsg * 1000){
                	this_.LastTelegramNotify[node_name] = new Date().getTime();
         			th.sendTelegramMessage(th, result[k].chatid, "Hi "+result[k].first_name + ",  you node <b>"+node_name+"</b> seems to be <b>DOWN</b>. Please take a look. Thanks in advanced.&parse_mode=html");
         		}
         	}
         }
  	});

}

function sendTelegramMessage(this_, chatid, msg){

	var telegr_msg = {
			url: this_.data.CONFIG.TELEGRAM_API.sendMessage() ,
			data: 'chat_id='+chatid+'&text='+msg+''
	};
	//var telegr_msg = 'chat_id='+chatid+'&text='+msg;
    //console.log(telegr_msg);
	this_.telegramRequest(telegr_msg, this_, function(error, response, body){});

}

function telegramRequest(data, this_, calbback){

	//console.log(data.url);
	this_.data.request.post({
			headers: {	'content-type' : 'application/x-www-form-urlencoded'},
			url: data.url,
			body: data.data,
			json: true
		}, function (error, response, body) {
		    calbback(error, response, body);

		}
	);
}


function updateTelegramUsres(this_, chatid, data){
	//var newvalues = { $set: data };
	var th = this_;
	this_.data.dbo.collection("telegram").update({ chatid: chatid }, data, {upsert: true});
}


function countObj(obj) {
  return Object.keys(obj).length;
}


// ==UserScript==
// @name         MakeChat Enhancinator
// @version      1.17.2018.09
// @description  Enhancement script for Zobe.com and TeenChat.com.
// @downloadURL  https://raw.github.com/une-s/MakeChat-Enhancinator/master/makechat-enhancinator.user.js
// @author       Une S
// @match        http://zobe.com/*
// @match        https://zobe.com/*
// @match        http://www.zobe.com/*
// @match        https://www.zobe.com/*
// @match        http://teenchat.com/*
// @match        https://teenchat.com/*
// @match        http://www.teenchat.com/*
// @match        https://www.teenchat.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    var version = "1.17.2018.09";

    if(!this.MakeChat) {
        return;
    }
    var site = this.location.href.match(/^https?:\/\/(www\.)?([a-z]+)\./)[2];
    var $ = this.jQuery;
    var $elems = {};
    var Emotes = this.Emotes;
    var MakeChat = this.MakeChat;
    var Sounds = MakeChat.Sounds;
    var Models = MakeChat.Models;
    var settings = MakeChat.settings;
    var _socket = Models.Socket.prototype; // Prototype object
    var socket; // Actual object
    var room = Models.Room.prototype;
    var rooms = {};
    var self;
    var ignored = {};
    var privateChat = Models.PrivateChat.prototype;
    var Enhancinator = this.Enhancinator = {
        version: version
    };
    // Count recent room invites to prevent spam
    var recentInvites = getCounter(30); // Reset after 30 secs
    // Count recent enters/leaves to prevent spam
    var recentEnters = getCounter(2);
    // Observe when new posts are added to a chat room (in the DOM tree) and perform pending tasks on them once they are added
    // Only applies to tasks that can't be done until after the post has become an HTML element.
    var observer = (function() {
        var list = {};
        var tasks = [];
        return {
            observe: function(roomId) {
                if(list[roomId]) {
                    return;
                }
                var $rooms = $elems.chatrooms || ($elems.chatrooms = $("#publicChat > .chatrooms"));
                Array.prototype.forEach.call($rooms.children(".chatroom"), function(room) {
                    if(!observing(room)) {
                        observe(roomId, room);
                    }
                });
            },
            addTask: function(task) {
                tasks.push(task);
            }
        };
        function observing(room) {
            for(var roomId in list) {
                if(list.hasOwnProperty(roomId) && list[roomId][0] === room) {
                    return true;
                }
            }
            return false;
        }
        function observe(roomId, room) {
            var mo = new MutationObserver(callback);
            var logs = $(room).children(".log-container").children(".room").children(".logs")[0];
            mo.observe(logs, {childList: true, subtree: true});
            list[roomId] = [room, mo];
        }
        function callback(mutations, mo) {
            for(var mutation of mutations) {
                var removed = mutation.removedNodes[0];
                if(removed && removed.className == "content") {
                    mo.disconnect();
                }
                var added = mutation.addedNodes[0];
                if(added && added.tagName == "LI") {
                    while(tasks.length) {
                        var task = tasks.shift();
                        task(added);
                    }
                }
            }
        }
    })();
    var _debug = Enhancinator.debug = (function() {
        var states = {};
        var def = 'default';
        return {
            get: function(cat, cmd) {
                if(cat = states[cat]) {
                    if(cat[cmd] !== undefined) {
                        return cat[cmd];
                    } if(cat[def] !== undefined) {
                        return cat[def];
                    }
                }
                return !!states[def];
            },
            // Toggle debug on/of
            toggle: function(toggle, cat, cmd) {
                if(cat) {
                    states[cat] = states[cat] || {};
                    if(cmd) {
                        states[cat][cmd] = toggle;
                    } else {
                        states[cat] = {'default': toggle};
                    }
                } else {
                    states = {'default': toggle};
                }
            }
        };
    })();

    // Add class "zobe" or "teenchat" to body
    ($elems.body = $elems.body || $('body').first()).addClass(site);

    // Additional styling
    (function() {
        // Define style object
        var style = {
            '#help span.emotes': {
                'width': '60px'
            },
            'body.teenchat .create.button': {
                'display': 'inline-block',
                'background-color': '#4a5dbb',
                'padding': '5px 15px',
                'color': '#fff',
                'text-transform': 'uppercase',
                'position': 'relative',
                'left': '20px'
            },
            'body.teenchat #confirm-modal .confirm.button': {
                'color': 'rgba(0,0,200,0.5)'
            },
            'body.zobe #confirm-modal': {
                'background': '#f3f6f9'
            },
            'body.zobe.cosmos #confirm-modal': {
                'background': '#314041'
            },
            'body.zobe.cosmos #confirm-modal .message': {
                'color': '#aac9cf'
            }
        };

        // Convert to string
        var str = '';
        for(var select of Object.getOwnPropertyNames(style)) {
            str += select + '{';
            var content = style[select];
            for(var prop of Object.getOwnPropertyNames(content)) {
                str += prop + ':' + content[prop] + ';';
            }
            str += '}';
        }

        // Create style element
        var el = document.createElement('style');
        el.innerHTML = str;
        document.head.appendChild(el);
    })(); //End styles

    // Edit help
    $(function() {
        var help = document.querySelector("#help .content");
        // If default help has been loaded already, edit right away
        if(help.children.length >= 8) {
            editHelp(help);
            return;
        }
        // Otherwise, edit once loaded
        var mo = new MutationObserver(function() {
            if(help.children.length >= 8) {
                mo.disconnect();
                editHelp(help);
            }
        });
        mo.observe(help, {childList: true});
    });

    // Edit settings
    $(function() {
        // Create settings markup
        createSettings({
            // Array meaning: [<setting text>, <toggled by default (true|false)>, <callback function on click>]
            'Text Settings': {
                'chat size':   ['Compact Texts'              , false],
                'hide-enter':  ['Hide enter/leave messages'  , false, function(toggle) { settings.hide_enter = toggle; }],
                'hide-rename': ['Hide name change messages'  , false, function(toggle) { settings.hide_rename = toggle; }]
            },
            'Sound Notifications': {
                'sfx mention': ['When my name is mentioned'  , true ],
                'sfx enter':   ['Someone enters/leaves'      , false],
                'sfx message': ['Someone enters a message'   , false],
                'sfx private': ['Someone sends a private msg', false, function(toggle) { settings.sounds.private = toggle; }],
                'sfx all':     ['Mute all sounds'            , false]
            },
            'Misc Settings': site === "zobe" && {
                'clr-theme':   ['Dark Theme'                 , false, function(toggle) { $elems.body[(toggle ? "add" : "remove") + "Class"]("cosmos"); }]
            }
        });
        function createSettings(settings) {
            var el = document.getElementById('settings'), label, elem, elem2;

            // Clear default
            while(el.firstChild) {
                el.removeChild(el.firstChild);
            }

            // Add replacement
            for(var catTitle of Object.getOwnPropertyNames(settings)) {
                var h2 = document.createElement('h2');
                var catContent = settings[catTitle];
                if(!catContent) {
                    continue;
                }
                h2.appendChild(document.createTextNode(catTitle));
                el.appendChild(h2);
                for(var item of Object.getOwnPropertyNames(catContent)) {
                    var itemContent = catContent[item];
                    label = document.createElement('label');
                    label.className = item;
                    elem = document.createElement('span');
                    elem.className = 'title';
                    elem.appendChild(document.createTextNode(itemContent[0]));
                    label.appendChild(elem);
                    elem = document.createElement('input');
                    elem.type = 'checkbox';
                    elem.checked = itemContent[1];
                    if(itemContent[2]) {
                        enableSetting(label, elem, itemContent[2]);
                    }
                    label.appendChild(elem);
                    elem2 = document.createElement('span');
                    elem2.className = 'check button';
                    elem = document.createElement('span');
                    elem.className = 'checkbox';
                    elem.appendChild(elem2);
                    label.appendChild(elem);
                    el.appendChild(label);
                }
            }
            elem = document.createElement('div');
            elem.className = 'close button';
            el.appendChild(elem);
        }
        // Enable settings that are new in enhancinator
        function enableSetting(setting, checkbox, callback) {
            setting.addEventListener('click', function(evt) {
                callback(checkbox.checked = !checkbox.checked);
            });
            callback(checkbox.checked);
        }
    });
    // Edit outgoing data
    _socket.send = (function() {
        var send = _socket.send;
        return function(cmd, obj) {
            socket = socket || this;
            if(_debug.get('out', cmd)) {
                console.log('out -> ' + cmd + ' ' + JSON.stringify(obj));
            }
            switch(cmd) {
            case "post":
                obj = editSendMessage(obj, "Post");
                if(obj.Post.match(/^\/(?!msg\b)/i)) {
                    obj = roomCommands.call(this, obj);
                }
                break;
            case "im_post":
                obj = editSendMessage(obj, "Message");
                break;
            case "ignore":
                ignored[obj.UID] = true;
                break;
            case "unignore":
                delete ignored[obj.UID];
                break;
            }
            cmd = obj && obj.C || cmd;
            if(obj) {
                return send.call(this, cmd, obj);
            }
        };
    })();
    // edit handling of incoming data
    _socket.publish = (function() {
        var publish = _socket.publish;
        return function(cmd, obj) {
            var i, $settings, $theme;
            socket = socket || this;
            // Log debug output to console if turned on
            if(_debug.get('in', cmd)) {
                console.log('in -> ' + cmd + ' ' + JSON.stringify(obj));
            }
            switch(cmd) {
            case "set_theme":
                $settings = $elems.settings || ($elems.settings = $('#settings'));
                $theme = $settings.find('.clr-theme');
                if($theme.find('input[type="checkbox"]')[0].checked != (obj.Theme == "dark")) {
                    $theme.click();
                }
                return;
            case "system_post":
                if(obj.Message === "Invalid Command") {
                    break;
                }
                // Correct mistakes in system post messages
                obj.Message = obj.Message.replace("Earm more karma to send declare messages.", "Win the karma raffle to send a declare message.");
                break;
            case "growl":
                obj = editGrowl(obj);
                break;
            case "im_message":
                // Play sound upon receiving private messages if setting is turned on
                if(settings.sounds.private) {
                    Sounds.play("mentioned");
                }
                break;
            case "backlog":
                observer.observe(obj.RoomID);
                // Hide enter/leave messages from backlog if setting is turned on
                for(i = obj.Events.length - 1; i >= 0; i--) {
                    if(obj.Events[i].C.search(/^(add|remove)user$/) >= 0) {
                        if(settings.hide_enter || ignored[obj.Events[i].UID]) {
                            obj.Events.splice(i, 1);
                        }
                    }
                }
                break;
            }
            if(obj) {
                return publish.call(this, cmd, obj);
            }
        };
    })();

    // Edit/block posted room messages
    room.post = (function() {
        var post = room.post;
        return function(obj) {
            if(!rooms[this.id]) {
                rooms[this.id] = this;
                observer.observe(this.id);
            }
            var userId = obj.id;
            var user = userId && this.users.get(userId);
            var maxEnterLeaves = 4;
            var recent;
            if(user && user.get("self")) {
                self = user;
            }
            // If enter/leave message
            if(obj.type && obj.type.search(/^(enter|leave)$/) >= 0) {
                recent = recentEnters.add(userId, this.id);
                // If enter/leave flodding
                if(recent.count > maxEnterLeaves) {
                    // Auto-ignore
                    !ignored[userId] && socket.send("ignore", {UID: userId});
                    // Remove the previous enters/leaves that contributed to this flooding
                    while(recent.elems.length) {
                        recent.elems.pop().remove();
                    }
                    return;
                }
                // Hide enter/leave messages if setting is turned on, or if ignored
                if(settings.hide_enter || ignored[userId]) {
                    return;
                }
                // Store enter/leave element (max 2 seconds)
                // These will be deleted from the DOM later if they turn out to be spam/flooding
                observer.addTask(function(elem) {
                    recent.elems = recent.elems || [];
                    recent.elems.push(elem);
                });
            }
            // On name change messages
            if(obj.type == "system" && obj.post.search(" is now " + obj.name) >= 0) {
                // Hide if ignored or if setting is turned on
                if(settings.hide_rename || ignored[userId]) {
                    return;
                }
            }
            return post.apply(this, arguments);
        }
    })();
    privateChat.focus = (function(){
        var focus = privateChat.focus;
        var $chats = $('#user-tab-messages .privatechats');
        return function(){
            // For Zobe.com only: Make sure invite button shows
            if(site == "zobe") {
                $chats.find('.invite').css('display', '');
            }
            focus.apply(this, arguments);
        };
    })();

    if(site == "teenchat") {
        $('#header > .logo').after("<div class='create button'>Create Room</div>");
    }

    // Emoji stuff

    // Convert all equal (non-meme) emojis to gifs, not just the first one
    Emotes.list.forEach(function(emote) {
        emote[0] = new RegExp(emote[0].replace(/[()*?]/g, "\\$&"), "g");
    });
    // Structure meme emojis better
    Emotes.memeList = [];
    Emotes.addMeme = function(cmd) {
        var img = cmd.replace(/:/g, "");
        for(cmd of arguments) {
            Emotes.memeList.push([cmd, img, new RegExp(cmd, "g")]);
        }
    };
    Emotes.emotifyPost = function(msg) {
        for(var meme of Emotes.memeList) {
            msg = msg.replace(meme[2], Emotes.emotifyPng(meme[1]));
        }
        return msg;
    }
    Emotes.addMeme(":wtf:");
    Emotes.addMeme(":troll:", ":trollface:");
    Emotes.addMeme(":facepalm:");
    Emotes.addMeme(":sadfrog:", ":feelsbadman:"); // :feelsbadman: converts to the :sadfrog: emoji as oginially intended
    Emotes.addMeme(":lol:", ":LOL:");
    Emotes.addMeme("T_T");
    Emotes.addMeme(":pokerface:", ":poker:");
    // Fix emoji changes not taking effect on TeenChat
    MakeChat.convertPost = function(msg) {
        return Emotes.emotifyPost(Emotes.emotifyBasic(msg));
    };

    // Functions

    function getCounter(resetTime){
        var store = {};
        return {
            add: function(userId, roomId) {
                var id = userId + (roomId || "");
                if(!store[id]) {
                    store[id] = {count: 0};
                    setTimeout(function(){
                        delete store[id];
                    }, resetTime*1000);
                }
                store[id].count++;
                return store[id];
            },
        };
    };
    function getSelf(users) {
        if(!self) {
            for(var uid in users._byId) {
                var user = users.get(uid);
                if(user.get("self")) {
                    self = user;
                    break;
                }
            }
        }
        return self;
    }
    // Edit outgoing messages
    function editSendMessage(obj, msgKey) {
        var msg = obj[msgKey];
        // Remove redundant whitespaces
        msg = msg.trim().replace(/\s+/g, ' ');
        // Convert :feelsbadman: to :sadfrog:
        msg = msg.replace(/:feelsbadman:/g, ":sadfrog:");
        obj[msgKey] = msg;
        return obj;
    }
    function editGrowl(obj) {
        var msg = obj.Message;
        // Prevent flooding with room invites
        if(msg.search(" has invited you to a room: ") >= 0) {
            var uid = msg.match(/^@\[([0-9A-Za-z]+)\|/)[1];
            if(ignored[uid]) {
                return;
            }
            var count = recentInvites.add(uid).count;
            if(count > 1) {
                if(count > 10) {
                    socket.send("ignore", {UID: uid});
                }
                return;
            }
        }
        // Correct mistakes in growl messages
        msg = msg.replace('You can use this boost again in 6 hours', function(match) {
            return match.replace('6', '4');
        });
        obj.Message = msg;
        return obj;
    }
    function roomCommands(obj) {
        var post = obj.Post;
        var room = rooms[obj.RoomID];
        var match = post.match(/^\/(\S+)(?:\s(.+))?$/);
        var cmd = match[1].toLowerCase();
        var arg = match[2];
        var user, confirmMsg;
        switch(cmd) {
        case "kick":
            if(arg = tagToUid(arg)) {
                obj = {C:"kick_user", RoomID:room.id, UserID:arg, Reason:"kicked", Message:"You have been kicked from the room"};
            } else {
                systemMessage("To kick, type /kick &lt;username&gt;", room.id);
                return;
            }
            break;
        case "assign_mod":
            if(arg = tagToUid(arg)) {
                user = room.users.get(arg);
                confirmMsg = "Do you want to promote "+user.get("name")+" to moderator of this room?";
                confirm(confirmMsg, function(){
                    socket.send("assign_moderator", {RoomID:room.id, UserID:user.id});
                });
            } else {
                systemMessage("To assign as room moderator, type /assign_mod &lt;username&gt;", room.id);
            }
            return;
        }
        return obj;
    }
    function tagToUid(tag) {
        var match = tag && tag.match(/^@\[([0-9A-Za-z]+)\|[^\]]*\]$/);
        if(match) {
            return match[1];
        }
    }
    // Display confirm popup
    function confirm(msg, callback) {
        var $el = $elems.confirm || ($elems.confirm = $('#confirm-modal'));
        var $btn = $el.find('.confirm');
        $btn.off().click(function() {
            $el.addClass('hidden');
            callback();
        });
        $el.find('.message').text(msg);
        $el.removeClass('hidden');
    }
    function systemMessage(msg, roomId) {
        socket.publish("system_post", {Time: Date.now(), RoomID: roomId, Message: msg});
    }
    function editHelp(help) {

        var updated = 'August 28, 2018';

        var upd = help.children[0];
        upd.replaceChild(document.createTextNode('Updated ' + updated), upd.firstChild);

        var basic = help.children[1].children;
        basic[0].replaceChild(document.createTextNode('Basic Emoticons'), basic[0].firstChild);
        var lastClmn = basic[4].children;
        while(lastClmn.length < 5) {
            basic[4].appendChild(document.createElement('li'));
        }
        lastClmn[2].innerHTML = Emotes.imgify('angel') + ' O:)';
        lastClmn[3].innerHTML = Emotes.imgify('bucktooth') + ' :B';
        lastClmn[4].innerHTML = Emotes.imgify('leer') + ' &gt;:)';

        var memes = document.createElement('article');
        var el = document.createElement('h4');
        el.appendChild(document.createTextNode('Meme Emoticons'));
        memes.appendChild(el);
        var list = document.createElement('ul');
        list.className = "emotes memes";
        var map = {};
        Emotes.memeList.forEach(function(item) {
            if(!map[item[1]]) {
                el = map[item[1]] = document.createElement('li');
                el.innerHTML = Emotes.emotifyPng(item[1]) + ' ' + item[0];
                list.appendChild(el);
            }
        });
        memes.appendChild(list);
        help.insertBefore(memes, help.children[2]);
    }
}).call(window);

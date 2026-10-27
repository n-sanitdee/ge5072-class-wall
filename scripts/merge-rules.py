#!/usr/bin/env python3
"""Build the Realtime Database rules document shared by Hakoot and Ladpet.

The database has ONE rules document. This script keeps Hakoot's part (games/, index/) exactly as it is in
../ge5072-live-quiz/database.rules.json and replaces the wall part (walls/, wallIndex/), then writes the merged
document to BOTH repos' database.rules.json. Publish that file in the Firebase console afterwards.

    python3 scripts/merge-rules.py [path/to/ge5072-live-quiz]
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HAKOOT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(HERE), 'ge5072-live-quiz')

W = "root.child('walls').child($code)"
H = f"auth != null && {W}.child('meta/hostUid').val() == auth.uid"
# Readable by everyone with the code: after the reveal, or always on a live (custom) wall.
SHOWN = f"({W}.child('pub/revealed').val() == true || {W}.child('pub/live').val() == true)"
OPEN = f"{W}.child('pub/revealed').val() != true && {W}.child('pub/ended').val() != true"
# 27 Oct 2026 (Mew): a group's post stays editable by every member until the wall ends, also after the reveal.
NOT_ENDED = f"{W}.child('pub/ended').val() != true"
TEAM = f"{W}.child('teams').child($tid).child('name').exists() && !{W}.child('kicked').child($tid).exists()"
HOST_OR_SHOWN = f"({H}) || {SHOWN}"
POSTER = f"({H}) || ({TEAM} && {NOT_ENDED})"
NAME_OK = ("newData.isString() && newData.val().length >= 1 && newData.val().length <= 60 && "
           "!newData.val().contains('.') && !newData.val().contains('$') && !newData.val().contains('#') && "
           "!newData.val().contains('[') && !newData.val().contains(']') && !newData.val().contains('/')")
IMMUTABLE_BOOL = "newData.isBoolean() && (!data.exists() || newData.val() == data.val())"


def media(maxlen):
    return {
        ".read": HOST_OR_SHOWN,
        "$tid": {
            ".read": True,
            ".write": POSTER,
            ".validate": f"newData.isString() && newData.val().beginsWith('data:image/jpeg;base64,') && newData.val().length <= {maxlen} && {W}.child('pub/photo').val() == true",
        },
    }


WALLS = {
    "wallIndex": {
        ".read": "auth != null && query.orderByChild == 'createdAt' && query.limitToFirst <= 100",
        ".indexOn": ["createdAt"],
        "$code": {
            ".write": "auth != null && ((!data.exists() && newData.child('hostUid').val() == auth.uid) || (!newData.exists() && (!data.exists() || data.child('hostUid').val() == auth.uid || data.child('createdAt').val() < now - 10800000)))",
            ".validate": "$code.matches(/^[0-9]{6}$/) && newData.hasChildren(['hostUid', 'createdAt'])",
            "hostUid": {".validate": "newData.isString()"},
            "createdAt": {".validate": "newData.val() == now"},
            "$other": {".validate": False},
        },
    },
    "walls": {
        "$code": {
            ".write": "auth != null && ((!data.exists() && newData.child('meta/hostUid').val() == auth.uid) || (!newData.exists() && (!data.exists() || data.child('meta/hostUid').val() == auth.uid || data.child('meta/createdAt').val() < now - 10800000)))",
            ".validate": "$code.matches(/^[0-9]{6}$/) && newData.hasChildren(['meta', 'pub'])",
            "meta": {
                ".read": "auth != null",
                ".validate": "newData.hasChildren(['hostUid', 'createdAt'])",
                "hostUid": {".validate": "newData.val() == auth.uid"},
                "createdAt": {".validate": "newData.val() == now"},
                "$other": {".validate": False},
            },
            "pub": {
                ".read": True,
                ".write": H,
                ".validate": "newData.hasChildren(['title', 'preset', 'section', 'photo', 'revealed'])",
                "title": {".validate": "newData.isString() && newData.val().length <= 120"},
                "prompt": {".validate": "newData.isString() && newData.val().length <= 5000"},
                "preset": {".validate": "newData.isString() && newData.val().length <= 40"},
                "section": {".validate": "newData.isString() && newData.val().length <= 20"},
                "photo": {".validate": IMMUTABLE_BOOL},
                "live": {".validate": IMMUTABLE_BOOL},
                "revealed": {".validate": "newData.isBoolean() && (data.val() != true || newData.val() == true)"},
                "locked": {".validate": "newData.isBoolean()"},
                "ended": {".validate": "newData.isBoolean()"},
                "fixes": {".validate": "newData.isBoolean()"},
                "expected": {".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 200 && newData.val() % 1 == 0"},
                "roster": {"$i": {".validate": "newData.hasChildren(['n', 'p'])"}},
                "$other": {".validate": False},
            },
            # Readable by everyone with the code (27 Oct 2026): members tap their group to join it and co-edit.
            "teams": {
                ".read": True,
                "$tid": {
                    ".read": True,
                    ".write": f"({H}) || (!data.exists() && newData.exists() && !{W}.child('kicked').child($tid).exists() && {W}.child('pub/locked').val() != true && {OPEN})",
                    ".validate": "$tid.matches(/^[A-Za-z0-9]{20}$/) && newData.hasChildren(['name', 'joinedAt'])",
                    "name": {".validate": NAME_OK + " && (data.exists() ? newData.val() == data.val() : newData.parent().parent().parent().child('names').child(newData.val().toLowerCase().replace(' ', '')).val() == $tid)"},
                    "joinedAt": {".validate": "data.exists() ? newData.val() == data.val() : newData.val() == now"},
                    # the participants' nicknames; any member can add one later
                    "members": {
                        ".write": f"{TEAM} && {NOT_ENDED}",
                        "$i": {".validate": "$i.matches(/^([0-9]|1[01])$/) && newData.isString() && newData.val().length >= 1 && newData.val().length <= 30"},
                    },
                    "$other": {".validate": False},
                },
            },
            "names": {
                ".read": H,
                "$key": {
                    ".write": f"({H}) || (!data.exists() && newData.isString() && !{W}.child('teams').child(newData.val()).exists() && newData.parent().parent().child('teams').child(newData.val()).child('name').val().toLowerCase().replace(' ', '') == $key)",
                    ".validate": "newData.isString()",
                },
            },
            "kicked": {
                ".read": H,
                ".write": H,
                "$tid": {".read": True},
            },
            # Wk14 chart: the host gives each name one chart (0-9); the name reads its own.
            "assign": {
                ".read": HOST_OR_SHOWN,
                ".write": H,
                "$tid": {
                    ".read": True,
                    ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 9 && newData.val() % 1 == 0",
                },
            },
            "posts": {
                ".read": HOST_OR_SHOWN,
                "$tid": {
                    ".read": True,
                    ".write": POSTER,
                    # co-edited part by part (merge.ts), so a post may be empty for a moment; `done` = "Post on Ladpet"
                    ".validate": "newData.hasChild('at')",
                    "at": {".validate": "newData.val() == now"},
                    # no length limit on answers (Mew, 27 Oct 2026)
                    "text": {".validate": "newData.isString() && newData.val().length >= 1"},
                    "done": {".validate": "newData.val() == true"},
                    # f0-f9 = finished sentences (shown), b0-b9 = the guided inputs as JSON (to refill the form)
                    "fields": {"$f": {".validate": "$f.matches(/^[fb][0-9]$/) && newData.isString() && newData.val().length >= 1"}},
                    "choice": {".validate": f"newData.isNumber() && newData.val() >= 0 && newData.val() <= 9 && newData.val() % 1 == 0 && (!{W}.child('assign').child($tid).exists() || newData.val() == {W}.child('assign').child($tid).val())"},
                    "photo": {".validate": f"newData.val() == true && {W}.child('pub/photo').val() == true && newData.parent().parent().parent().child('photos').child($tid).exists() && newData.parent().parent().parent().child('thumbs').child($tid).exists()"},
                    "$other": {".validate": False},
                },
            },
            "thumbs": media(200000),
            "photos": media(1500000),
            "$other": {".validate": False},
        },
    },
}

src = os.path.join(HAKOOT, 'database.rules.json')
doc = json.load(open(src))
rules = {k: v for k, v in doc['rules'].items() if k not in WALLS}
rules.update(WALLS)
doc['rules'] = rules
text = json.dumps(doc, indent=2, ensure_ascii=False) + '\n'
for path in (src, os.path.join(HERE, 'database.rules.json')):
    open(path, 'w').write(text)
    print('wrote', path)

from py.get_setting import load_settings

async def auto_behavior(behaviorType="delay", time="00:00:00", prompt="", days=[], repeatNumber=1, isInfiniteLoop=False, platforms=["chat"]):
    # Load settings
    settings = await load_settings()
    
    # Build a new behavior item
    new_behavior = {
        "enabled": True,
        "platform": platforms[0] if platforms else "chat", # Compatibility with the legacy single-platform field
        "platforms": platforms,                           # Supports multiple selected channels
        "trigger": {
            "type": "time" if behaviorType == "time" else "cycle",
            "time":{
                "timeValue": time, 
                "days": days
            },
            "noInput":{
                "latency": 30, 
            },
            "cycle":{
                "cycleValue": time if behaviorType == "delay" else "00:00:30", 
                "repeatNumber": repeatNumber, 
                "isInfiniteLoop": isInfiniteLoop, 
            }
        },
        "action": {
            "type": "prompt",
            "prompt": "Time to act: "+prompt, 
            "random":{
                "events":[""],
                "type":"random",
                "orderIndex":0,
            }
        }
    }
    
    settings["behaviorSettings"]["behaviorList"].append(new_behavior)
    settings["behaviorSettings"]['enabled'] = True
    return settings


auto_behavior_tool = {
    "type": "function",
    "function": {
        "name": "auto_behavior",
        "description": "Use when the user asks you to perform an action at a specific time, after a delay, or on a specified channel. A task can be scheduled across multiple configured channels.",
        "parameters": {
            "type": "object",
            "properties": {
                "behaviorType": {
                    "type": "string",
                    "description": "Behavior type: time (at a specific time, such as 3 PM) or delay (after an interval, such as 5 minutes).",
                    "enum": ["time", "delay"],
                },
                "time": {
                    "type": "string",
                    "description": "Time in HH:MM:SS format. For time, this is the execution time; for delay, it is the interval.",
                },
                "prompt": {
                    "type": "string",
                    "description": "Task description, for example: remind the user about a meeting or send a greeting.",
                },
                "days": {
                    "type": "array",
                    "description": "Applies to time mode: [1,2,3,4,5] means weekdays, [0] means Sunday, and [] means no repeat.",
                    "items": {
                        "type": "number",
                        "enum": [0, 1, 2, 3, 4, 5, 6],
                    },
                    "default": [],
                },
                "repeatNumber": {
                    "type": "number",
                    "description": "Repeat count for delay mode (1-100).",
                    "minimum": 1,
                    "maximum": 100,
                    "default": 1,
                },
                "isInfiniteLoop": {
                    "type": "boolean",
                    "description": "Whether delay mode repeats indefinitely.",
                    "default": False,
                },
                "platforms": {
                    "type": "array",
                    "description": "Delivery channels: chat (web conversation), telegram, discord, slack.",
                    "items": {
                        "type": "string",
                        "enum": ["chat", "telegram", "discord", "slack"]
                    },
                    "default": ["chat"],
                }
            },
            "required": ["prompt", "behaviorType"],
        },
    },
}
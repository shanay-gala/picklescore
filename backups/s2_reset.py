"""One-shot: replace all Season-1 data in Atlas with Season-2 rosters."""
import json, os, sys, uuid
from datetime import datetime, timezone
from pymongo import MongoClient

MONGO = "mongodb+srv://court-live:VPi9tRr3tpa0prV2@cluster0.awe5jm0.mongodb.net/?appName=Cluster0&retryWrites=true&w=majority"
db = MongoClient(MONGO).picklescore

# Captain name per team (matched by prefix substring of team name in player name)
CAPTAINS = {
    "DEVEN":     "Deven Rita",
    "DHEER":     "Dheer Gada",
    "HEMIL":     "hemil shah",
    "HETANKSH":  "hetanksh chheda",
    "KEVIN":     "kevin jayesh shah",
    "MANAN":     "manan navin shah",
    "MOHIK":     "mohik hiten khirani",
    "PARTH":     "Parth Charla",
    "PRATIK":    "pratik gala",
    "PRATIK G":  "Pratik M Gada",
    "SIDDHARTH": "Siddharth Gala",
    "URVIL":     "urvil khutiya",
}

# All players (from extracted image data)
PLAYERS = [
    # DEVEN
    ("smit chaadhwa",         "8356808959", 22, "beginner", "DEVEN"),
    ("devarya mukesh shah",   "7718011112", 25, "beginner", "DEVEN"),
    ("Vansh Chheda",          "7738227171", 21, "advance",  "DEVEN"),
    ("Paresh Gada",           "9987986888", 48, "beginner", "DEVEN"),
    ("Yugam Dedhia",          "8169401782", 21, "beginner", "DEVEN"),
    ("Deven Rita",            "9821733976", 44, "advance",  "DEVEN"),
    # DHEER
    ("Dheer Gada",            "7045111081", 20, "advance",  "DHEER"),
    ("jainam narendra gala",  "9867242409", 26, "beginner", "DHEER"),
    ("shanay gala",           "9821242079", 23, "beginner", "DHEER"),
    ("Parth Nishar",          "7400350008", 23, "beginner", "DHEER"),
    ("Hiren Amrutlal Gala",   "8080558773", 31, "advance",  "DHEER"),
    ("Mit Nisar",             "9820615601", 27, "beginner", "DHEER"),
    # HEMIL
    ("hemil shah",            "7977441859", 27, "advance",  "HEMIL"),
    ("pratik m shah",         "9833252526", 33, "beginner", "HEMIL"),
    ("Bhavin gala",           "9892910997", 36, "beginner", "HEMIL"),
    ("Karan Savla",           "9870545862", 23, "beginner", "HEMIL"),
    ("Divya Gada",            "7977352508", 29, "beginner", "HEMIL"),
    ("Harshil Gala",          "9819944402", 27, "advance",  "HEMIL"),
    # HETANKSH
    ("ravi mansukh shah",     "9769349320", 33, "beginner", "HETANKSH"),
    ("hetanksh chheda",       "9819652420", 27, "advance",  "HETANKSH"),
    ("Keval Dagha",           "9930394039", 27, "beginner", "HETANKSH"),
    ("Rushabh Harsh Gala",    "9819699609", 34, "beginner", "HETANKSH"),
    ("Nayan Rita",            "7045422390", 22, "advance",  "HETANKSH"),
    ("Ashish Charla",         "8879729864", 33, "beginner", "HETANKSH"),
    # KEVIN
    ("krushik gala",          "8767066990", 32, "beginner", "KEVIN"),
    ("kevin jayesh shah",     "9833302200", 26, "advance",  "KEVIN"),
    ("Harshil Gindra",        "8356058687", 23, "beginner", "KEVIN"),
    ("Pankaj Shah",           "9322702707", 45, "beginner", "KEVIN"),
    ("Vatsal Ashwin Gada",    "9769176849", 25, "beginner", "KEVIN"),
    ("KIRAN CHHEDA",          "9930053937", 43, "advance",  "KEVIN"),
    # MANAN
    ("krishit karia",         "9137228449", 18, "advance",  "MANAN"),
    ("manan navin shah",      "9833030320", 29, "advance",  "MANAN"),
    ("Jinesh Rajesh Shsh",    "9867355999", 24, "beginner", "MANAN"),
    ("Hadi Gala",             "8928325677", 20, "beginner", "MANAN"),
    ("Rohit Gindra",          "9819829309", 32, "beginner", "MANAN"),
    ("Manan Gada",            "8898042364", 28, "advance",  "MANAN"),
    # MOHIK
    ("mohik hiten khirani",   "9768633786", 21, "advance",  "MOHIK"),
    ("smit shailesh gada",    "9082279530", 24, "advance",  "MOHIK"),
    ("Keval Mansukh Khutiya", "8879504488", 30, "beginner", "MOHIK"),
    ("Jainam Arvind Gala",    "8928893095", 21, "beginner", "MOHIK"),
    ("Jinesh Kalyanji Gala",  "9769494872", 19, "beginner", "MOHIK"),
    ("deep dhiraj shah",      "8080577776", 28, "beginner", "MOHIK"),
    # PARTH
    ("yug manoj chheda",      "9967875565", 24, "beginner", "PARTH"),
    ("ayush gada",            "9930063677", 27, "beginner", "PARTH"),
    ("Prem Chheda",           "9326624118", 25, "beginner", "PARTH"),
    ("Vinay Gindra",          "9867988216", 30, "beginner", "PARTH"),
    ("Parth Charla",          "9819656677", 35, "advance",  "PARTH"),
    ("Jay Karia",             "9768080709", 26, "advance",  "PARTH"),
    # PRATIK
    ("Bhavin satra",          "9321155159", 37, "advance",  "PRATIK"),
    ("mayur shantilal faria", "9372160047", 34, "beginner", "PRATIK"),
    ("pratik gala",           "9967243500", 39, "advance",  "PRATIK"),
    ("Vrushank Vinay Satra",  "8169214522", 22, "beginner", "PRATIK"),
    ("Rushabh Rajesh Gada",   "8369548109", 28, "beginner", "PRATIK"),
    ("Sutlej Gala",           "7977863284", 18, "beginner", "PRATIK"),
    # PRATIK G
    ("sukem chheda",          "9324093243", 25, "beginner", "PRATIK G"),
    ("deepan dagha",          "9821271190", 27, "beginner", "PRATIK G"),
    ("vatsal dilip charla",   "9987496756", 24, "beginner", "PRATIK G"),
    ("Mit Haresh Gada",       "9619366277", 30, "advance",  "PRATIK G"),
    ("Pratik M Gada",         "9819839563", 40, "advance",  "PRATIK G"),
    ("Mann Nandu",            "9892738540", 22, "beginner", "PRATIK G"),
    # SIDDHARTH
    ("Jay haresh gala",       "9870799606", 32, "beginner", "SIDDHARTH"),
    ("devansh sanjay savla",  "9324288556", 23, "beginner", "SIDDHARTH"),
    ("Aryan Nandu",           "8080319319", 21, "beginner", "SIDDHARTH"),
    ("Varun Dharmendra Gada", "9082537529", 24, "advance",  "SIDDHARTH"),
    ("Siddharth Gala",        "9619154785", 29, "advance",  "SIDDHARTH"),
    ("Aashish Gala",          "9870050604", 41, "beginner", "SIDDHARTH"),
    # URVIL
    ("pranay jayantilal nisar", "9820314606", 30, "beginner", "URVIL"),
    ("mitesh karia",          "9819272009", 41, "beginner", "URVIL"),
    ("urvil khutiya",         "8082027775", 31, "advance",  "URVIL"),
    ("Jash Hasmukh Shah",     "9819561415", 26, "beginner", "URVIL"),
    ("Manav Rajesh Satra",    "9768110460", 24, "beginner", "URVIL"),
    ("Ayush Daghha",          "9222223456", 25, "advance",  "URVIL"),
]

now = datetime.now(timezone.utc).isoformat()

# WIPE Season-1 data
print("Wiping Season-1 data from Atlas...")
db.matches.delete_many({})
db.fixtures.delete_many({})
db.players.delete_many({})
db.teams.delete_many({})

# Also reset any leftover bonus_points on teams collection (fresh S2)
# (teams collection is already empty, but this is defensive.)

# INSERT teams
print(f"Inserting {len(CAPTAINS)} teams...")
team_ids = {}
for team_name, captain in CAPTAINS.items():
    tid = str(uuid.uuid4())
    team_ids[team_name] = tid
    db.teams.insert_one({
        "id": tid,
        "name": team_name,
        "captain_name": captain,
        "bonus_points": 0,   # Season 2 starts from 0
        "created_at": now,
    })

# INSERT players
print(f"Inserting {len(PLAYERS)} players...")
seen_teams = {}
for (pname, contact, age, cat, team_name) in PLAYERS:
    seen_teams[team_name] = seen_teams.get(team_name, 0) + 1
    is_captain = pname.strip().lower() == CAPTAINS[team_name].strip().lower()
    db.players.insert_one({
        "id": str(uuid.uuid4()),
        "name": pname,
        "contact": contact,
        "age": age,
        "category": cat,
        "team_id": team_ids[team_name],
        "is_captain": is_captain,
        "created_at": now,
    })

# Sanity: each team should have at least 1 captain
for team_name, tid in team_ids.items():
    captains = list(db.players.find({"team_id": tid, "is_captain": True}, {"_id":0, "name":1}))
    count = seen_teams.get(team_name, 0)
    print(f"  {team_name:<10} players={count:>2} captain={captains[0]['name'] if captains else 'MISSING'}")

print()
print(f"Total teams: {db.teams.count_documents({})}")
print(f"Total players: {db.players.count_documents({})}")
print(f"Total fixtures: {db.fixtures.count_documents({})}")
print(f"Total matches: {db.matches.count_documents({})}")

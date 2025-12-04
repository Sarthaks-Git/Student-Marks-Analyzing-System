// init_db.js
const Database = require('better-sqlite3');
const db = new Database('data.sqlite');

// drop old tables (safe for dev)
db.exec(`
PRAGMA foreign_keys = ON;
DROP TABLE IF EXISTS marks;
DROP TABLE IF EXISTS assessments;
DROP TABLE IF EXISTS course_offerings;
DROP TABLE IF EXISTS subjects;
DROP TABLE IF EXISTS semesters;
DROP TABLE IF EXISTS students;
DROP TABLE IF EXISTS teachers;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS grade_scale;
`);

// users
db.exec(`
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE,
  role TEXT CHECK(role IN ('admin','teacher','student')) NOT NULL,
  name TEXT
);
`);

// students & teachers are in users table with role
db.exec(`
CREATE TABLE semesters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  ordinal INTEGER
);
CREATE TABLE subjects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT,
  title TEXT,
  credits INTEGER
);
CREATE TABLE course_offerings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id INTEGER REFERENCES subjects(id),
  semester_id INTEGER REFERENCES semesters(id),
  teacher_id INTEGER REFERENCES users(id)
);
CREATE TABLE assessments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_offering_id INTEGER REFERENCES course_offerings(id),
  name TEXT,
  max_marks REAL,
  weight_percent REAL
);
CREATE TABLE marks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  assessment_id INTEGER REFERENCES assessments(id) ON DELETE CASCADE,
  student_id INTEGER REFERENCES users(id),
  marks_obtained REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
/* grade scale */
CREATE TABLE grade_scale (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  min_percent REAL,
  max_percent REAL,
  grade_point REAL,
  grade_letter TEXT
);
`);

// seed grade scale (example)
const insertGrade = db.prepare(`INSERT INTO grade_scale(min_percent,max_percent,grade_point,grade_letter) VALUES(?,?,?,?)`);
insertGrade.run(90, 100, 10, 'A+');
insertGrade.run(80, 89.99, 9, 'A');
insertGrade.run(70, 79.99, 8, 'B+');
insertGrade.run(60, 69.99, 7, 'B');
insertGrade.run(50, 59.99, 6, 'C');
insertGrade.run(40, 49.99, 5, 'D');
insertGrade.run(0, 39.99, 0, 'F');

// seed users
const u = db.prepare(`INSERT INTO users(username,role,name) VALUES(?,?,?)`);
u.run('admin','admin','Administrator');
u.run('t_alex','teacher','Prof. Alex');
u.run('t_maya','teacher','Prof. Maya');
u.run('s_ankit','student','Ankit Sharma');
u.run('s_ria','student','Ria Gupta');

// seed semesters
const sem = db.prepare(`INSERT INTO semesters(name,ordinal) VALUES(?,?)`);
sem.run('Sem 1 2025',1);
sem.run('Sem 2 2025',2);

// seed subjects
const subj = db.prepare(`INSERT INTO subjects(code,title,credits) VALUES(?,?,?)`);
subj.run('CS101','Intro to Programming',4);
subj.run('CS102','Data Structures',4);
subj.run('MA101','Calculus',3);

// seed course_offerings (map a subject to a semester and teacher)
const co = db.prepare(`INSERT INTO course_offerings(subject_id,semester_id,teacher_id) VALUES(?,?,?)`);
co.run(1,1,2); // CS101 taught by teacher id=2 (Prof. Alex)
co.run(2,1,3); // CS102 taught by teacher id=3 (Prof. Maya)
co.run(3,1,2); // MA101 by Alex

// seed assessments (for CS101 offering id=1)
const as = db.prepare(`INSERT INTO assessments(course_offering_id,name,max_marks,weight_percent) VALUES(?,?,?,?)`);
as.run(1,'Internal Test 1',20,10);
as.run(1,'Internal Test 2',20,10);
as.run(1,'Viva',10,10);
as.run(1,'Final Exam',50,70);

// assessments for CS102 offering id=2
as.run(2,'Internal Test',30,20);
as.run(2,'Final Exam',70,80);

// seed marks for Ankit (s_ankit user id will be 4) for CS101 assessments
const mk = db.prepare(`INSERT INTO marks(assessment_id,student_id,marks_obtained) VALUES(?,?,?)`);
mk.run(1,4,15);
mk.run(2,4,16);
mk.run(3,4,8);
mk.run(4,4,35);

// sample marks for Ria (user id 5)
mk.run(1,5,17);
mk.run(2,5,15);
mk.run(3,5,9);
mk.run(4,5,40);

// done
console.log('DB init complete (data.sqlite created/seeded).');
db.close();

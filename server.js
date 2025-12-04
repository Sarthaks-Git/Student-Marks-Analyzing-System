// server.js
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const Database = require('better-sqlite3');

const db = new Database('data.sqlite', { verbose: console.log });
const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public')); // serve the frontend

// --- utility: get grade point from percent ---
function percentToGradePoint(percent) {
  const stmt = db.prepare('SELECT grade_point, grade_letter FROM grade_scale WHERE ? BETWEEN min_percent AND max_percent LIMIT 1');
  const row = stmt.get(percent);
  if (row) return { point: row.grade_point, letter: row.grade_letter };
  return { point: 0, letter: 'F' };
}

// --- endpoints ---
// get all users (admin)
app.get('/api/users', (req, res) => {
  const rows = db.prepare('SELECT id, username, role, name FROM users').all();
  res.json(rows);
});
// update user (admin) - edit name or role (role can be 'teacher' etc.)
app.put('/api/users/:id', (req, res) => {
  const id = Number(req.params.id);
  const { username, name, role } = req.body;
  if (!id) return res.status(400).json({ error: 'invalid id' });
  const stmt = db.prepare('UPDATE users SET username = COALESCE(?, username), name = COALESCE(?, name), role = COALESCE(?, role) WHERE id = ?');
  const info = stmt.run(username || null, name || null, role || null, id);
  if (info.changes === 0) return res.status(404).json({ error: 'user not found' });
  res.json({ ok: true });
});

// delete user (admin)
app.delete('/api/users/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'invalid id' });
  const info = db.prepare('DELETE FROM users WHERE id = ?').run(id);
  if (info.changes === 0) return res.status(404).json({ error: 'user not found' });
  res.json({ ok: true });
});

// create user
app.post('/api/users', (req, res) => {
  const { username, role, name } = req.body;
  const stmt = db.prepare('INSERT INTO users(username, role, name) VALUES(?,?,?)');
  const info = stmt.run(username, role, name);
  res.json({ id: info.lastInsertRowid });
});

// get semesters
app.get('/api/semesters', (req, res) => {
  res.json(db.prepare('SELECT * FROM semesters ORDER BY ordinal').all());
});

// create semester (admin)
app.post('/api/semesters', (req, res) => {
  const { name, ordinal } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const stmt = db.prepare('INSERT INTO semesters(name, ordinal) VALUES(?, ?)');
  const info = stmt.run(name, ordinal || null);
  res.json({ id: info.lastInsertRowid, name, ordinal: ordinal || null });
});

// get subjects
app.get('/api/subjects', (req, res) => {
  res.json(db.prepare('SELECT * FROM subjects').all());
});

// create subject
app.post('/api/subjects', (req, res) => {
  const { code, title, credits } = req.body;
  const info = db.prepare('INSERT INTO subjects(code,title,credits) VALUES(?,?,?)').run(code, title, credits);
  res.json({ id: info.lastInsertRowid });
});

// get course offerings with joined info
app.get('/api/course_offerings', (req, res) => {
  const rows = db.prepare(`
    SELECT co.id, s.code, s.title, s.credits, se.name AS semester, u.id as teacher_id, u.name as teacher_name
    FROM course_offerings co
    JOIN subjects s ON s.id = co.subject_id
    JOIN semesters se ON se.id = co.semester_id
    LEFT JOIN users u ON u.id = co.teacher_id
  `).all();
  res.json(rows);
});

// create offering
app.post('/api/course_offerings', (req, res) => {
  const { subject_id, semester_id, teacher_id } = req.body;
  const info = db.prepare('INSERT INTO course_offerings(subject_id,semester_id,teacher_id) VALUES(?,?,?)').run(subject_id, semester_id, teacher_id);
  res.json({ id: info.lastInsertRowid });
});

// update an assessment (teacher/admin)
app.put('/api/assessments/:id', (req, res) => {
  const id = Number(req.params.id);
  const { name, max_marks, weight_percent } = req.body;
  if (!id) return res.status(400).json({ error: 'invalid id' });
  const stmt = db.prepare('UPDATE assessments SET name = COALESCE(?, name), max_marks = COALESCE(?, max_marks), weight_percent = COALESCE(?, weight_percent) WHERE id = ?');
  const info = stmt.run(name || null, (typeof max_marks !== 'undefined' ? max_marks : null), (typeof weight_percent !== 'undefined' ? weight_percent : null), id);
  if (info.changes === 0) return res.status(404).json({ error: 'assessment not found' });
  res.json({ ok: true });
});

// delete an assessment (marks will be deleted due to FK ON DELETE CASCADE)
app.delete('/api/assessments/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'invalid id' });
  const info = db.prepare('DELETE FROM assessments WHERE id = ?').run(id);
  if (info.changes === 0) return res.status(404).json({ error: 'assessment not found' });
  res.json({ ok: true });
});

// get assessments for a course offering id
app.get('/api/assessments/:courseOfferingId', (req, res) => {
  const c = Number(req.params.courseOfferingId);
  const rows = db.prepare('SELECT * FROM assessments WHERE course_offering_id = ?').all(c);
  res.json(rows);
});

// create assessment
app.post('/api/assessments', (req, res) => {
  const { course_offering_id, name, max_marks, weight_percent } = req.body;
  const info = db.prepare('INSERT INTO assessments(course_offering_id,name,max_marks,weight_percent) VALUES(?,?,?,?)')
    .run(course_offering_id, name, max_marks, weight_percent);
  res.json({ id: info.lastInsertRowid });
});

// get students
app.get('/api/students', (req, res) => {
  const rows = db.prepare("SELECT id, username, name FROM users WHERE role='student'").all();
  res.json(rows);
});

// create mark (teacher)
app.post('/api/marks', (req, res) => {
  const { assessment_id, student_id, marks_obtained } = req.body;
  const info = db.prepare('INSERT INTO marks(assessment_id,student_id,marks_obtained) VALUES(?,?,?)').run(assessment_id, student_id, marks_obtained);
  res.json({ id: info.lastInsertRowid });
});

// update mark
app.put('/api/marks/:id', (req, res) => {
  const id = Number(req.params.id);
  const { marks_obtained } = req.body;
  db.prepare('UPDATE marks SET marks_obtained = ?, created_at = CURRENT_TIMESTAMP WHERE id = ?').run(marks_obtained, id);
  res.json({ ok: true });
});

// get marks for a course offering (for teacher view)
app.get('/api/course/:coId/marks', (req, res) => {
  const coId = Number(req.params.coId);
  const rows = db.prepare(`
    SELECT m.id as mark_id, m.assessment_id, m.student_id, m.marks_obtained, u.name as student_name, a.name as assessment_name, a.max_marks, a.weight_percent
    FROM marks m
    JOIN users u ON u.id = m.student_id
    JOIN assessments a ON a.id = m.assessment_id
    WHERE a.course_offering_id = ?
    ORDER BY u.id, a.id
  `).all(coId);
  res.json(rows);
});

// compute course total percent for a student + grade point
app.get('/api/student/:studentId/course/:coId/summary', (req, res) => {
  const studentId = Number(req.params.studentId);
  const coId = Number(req.params.coId);
  // get assessments for course
  const assessments = db.prepare('SELECT id, name, max_marks, weight_percent FROM assessments WHERE course_offering_id = ?').all(coId);
  // get marks for student for those assessments
  const marks = db.prepare('SELECT assessment_id, marks_obtained FROM marks WHERE student_id = ? AND assessment_id IN (' + (assessments.map(a => a.id).join(',') || '0') + ')').all(studentId);
  const marksMap = {}; marks.forEach(m => marksMap[m.assessment_id] = m.marks_obtained);
  // compute percent
  let totalPercent = 0;
  for (const a of assessments) {
    const obtained = Number(marksMap[a.id] || 0);
    const contrib = (obtained / a.max_marks) * a.weight_percent;
    totalPercent += contrib;
  }
  const gp = percentToGradePoint(totalPercent);
  res.json({ course_percent: totalPercent, grade_point: gp.point, grade_letter: gp.letter, credits: db.prepare('SELECT s.credits FROM course_offerings co JOIN subjects s ON s.id = co.subject_id WHERE co.id = ?').get(coId).credits });
});

// compute semester GPA for a student (semester id)
app.get('/api/student/:studentId/semester/:semId/gpa', (req, res) => {
  const studentId = Number(req.params.studentId);
  const semId = Number(req.params.semId);
  // get all course_offerings in semester
  const offerings = db.prepare('SELECT co.id, s.credits FROM course_offerings co JOIN subjects s ON s.id = co.subject_id WHERE co.semester_id = ?').all(semId);
  let num = 0, den = 0;
  for (const co of offerings) {
    // compute percent for student in this co
    const assessments = db.prepare('SELECT id, max_marks, weight_percent FROM assessments WHERE course_offering_id = ?').all(co.id);
    if (assessments.length === 0) continue;
    const aidList = assessments.map(a => a.id).join(',') || '0';
    const marks = db.prepare(`SELECT assessment_id, marks_obtained FROM marks WHERE student_id = ? AND assessment_id IN (${aidList})`).all(studentId);
    const marksMap = {}; marks.forEach(m => marksMap[m.assessment_id] = m.marks_obtained);
    let totalPercent = 0;
    for (const a of assessments) {
      const obtained = Number(marksMap[a.id] || 0);
      totalPercent += (obtained / a.max_marks) * a.weight_percent;
    }
    const gp = percentToGradePoint(totalPercent).point;
    num += gp * co.credits;
    den += co.credits;
  }
  const gpa = den ? (num / den) : 0;
  res.json({ gpa, total_credits: den });
});

// compute CGPA across all semesters for student
app.get('/api/student/:studentId/cgpa', (req, res) => {
  const studentId = Number(req.params.studentId);
  // get all offerings student has marks for (we'll include all offerings with assessments)
  const offerings = db.prepare(`
    SELECT DISTINCT co.id, s.credits, co.semester_id
    FROM course_offerings co
    JOIN subjects s ON s.id = co.subject_id
    JOIN assessments a ON a.course_offering_id = co.id
  `).all();
  let num = 0, den = 0;
  for (const co of offerings) {
    const assessments = db.prepare('SELECT id, max_marks, weight_percent FROM assessments WHERE course_offering_id = ?').all(co.id);
    if (assessments.length === 0) continue;
    const aidList = assessments.map(a => a.id).join(',') || '0';
    const marks = db.prepare(`SELECT assessment_id, marks_obtained FROM marks WHERE student_id = ? AND assessment_id IN (${aidList})`).all(studentId);
    const marksMap = {}; marks.forEach(m => marksMap[m.assessment_id] = m.marks_obtained);
    let totalPercent = 0;
    for (const a of assessments) {
      const obtained = Number(marksMap[a.id] || 0);
      totalPercent += (obtained / a.max_marks) * a.weight_percent;
    }
    const gp = percentToGradePoint(totalPercent).point;
    num += gp * co.credits;
    den += co.credits;
  }
  const cgpa = den ? (num / den) : 0;
  res.json({ cgpa, total_credits: den });
});

// list assessments for course offering (teacher)
app.get('/api/co/:id/assessments', (req, res) => {
  const rows = db.prepare('SELECT * FROM assessments WHERE course_offering_id = ?').all(Number(req.params.id));
  res.json(rows);
});

// frontend convenience: list offerings + students
app.get('/api/offerings/:id/students', (req, res) => {
  // simple: return all students (no enrollment model in this MVP)
  const studs = db.prepare("SELECT id, username, name FROM users WHERE role='student'").all();
  res.json(studs);
});

// serve
const PORT = 4000;
app.listen(PORT, () => console.log('Server listening on', PORT));

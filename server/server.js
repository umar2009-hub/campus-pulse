const express = require("express");
const nodemailer = require("nodemailer");
const cors = require("cors");
const QRCode = require("qrcode");
const mongoose = require("mongoose");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const User = require("./models/User");
const Event = require("./models/Event");
const Registration = require("./models/Registration");

const app = express();

app.use(cors());
app.use(express.json());

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "campuspulse979@gmail.com",
    pass: "rtcn kvbf jzgk nqun",
  },
});

mongoose
  .connect(
    "mongodb+srv://campusadmin:campus123@campuspulse-cluster.y6axpum.mongodb.net/campuspulse",
  )
  .then(() => {
    console.log("MongoDB Connected Successfully");
  })
  .catch((error) => {
    console.log("MongoDB Connection Error:", error);
  });

app.get("/", (req, res) => {
  res.send("CampusPulse Backend + Database Running 🚀");
});

app.post("/create-user", async (req, res) => {
  try {
    const { name, email, role, department, year } = req.body;

    let user = await User.findOne({ email });

    if (user) {
      return res.json({
        message: "User already exists",
        email: user.email,
        password: user.password,
        user: user,
      });
    }

    const tempPassword = Math.random().toString(36).slice(-8);

    user = new User({
      name,
      email,
      password: tempPassword,
      role,
      department,
      year,
    });

    await user.save();

    res.json({
      message: "User created successfully",
      email: email,
      password: tempPassword,
      user: user,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Error creating user" });
  }
});

app.post("/register", async (req, res) => {
  try {
    const { name, email, password, role, department, year, faceDescriptor } = req.body;

    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ message: "User already exists" });
    }

    user = new User({
      name,
      email,
      password,
      role,
      department,
      year,
      faceDescriptor,
    });

    await user.save();
    res.json({ message: "Registration successful", user });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Error during registration" });
  }
});

app.post("/login-face", async (req, res) => {
  try {
    const { faceDescriptor } = req.body;

    if (!faceDescriptor || !Array.isArray(faceDescriptor)) {
      return res.status(400).json({ message: "Face descriptor required" });
    }

    const users = await User.find({ 
      faceDescriptor: { $exists: true, $type: "array", $not: { $size: 0 } } 
    }).lean();

    let bestMatch = null;
    let minDistance = 0.6; // Increased threshold for easier matching
    let bestDistanceFound = Infinity;

    for (const user of users) {
      const distance = faceDistance(faceDescriptor, user.faceDescriptor);
      
      if (distance < bestDistanceFound) {
        bestDistanceFound = distance;
      }

      if (distance < minDistance) {
        minDistance = distance;
        bestMatch = user;
        // Optimization: if we find a very good match, exit early
        if (minDistance < 0.3) break;
      }
    }

    if (!bestMatch) {
      return res.status(401).json({ message: "Face not recognized" });
    }

    res.json({ message: "Login successful", user: bestMatch });
  } catch (error) {
    console.log("Face login error:", error);
    res.status(500).json({ message: "Face login error" });
  }
});

function faceDistance(desc1, desc2) {
  if (desc1.length !== desc2.length) return Infinity;
  
  let sum = 0;
  for (let i = 0; i < desc1.length; i++) {
    const diff = desc1[i] - desc2[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email, password });

    if (!user) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    res.json({
      message: "Login successful",
      user: user,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      message: "Login error",
    });
  }
});

app.post("/create-event", async (req, res) => {
  try {
    const {
      title,
      description,
      date,
      time,
      venue,
      department,
      category,
      capacity,
    } = req.body;

    const event = new Event({
      title,
      description,
      date,
      time,
      venue,
      department,
      category,
      capacity,
      registered: 0,
      status: "upcoming",
    });

    await event.save();

    res.status(201).json({
      message: "Event created successfully",
      event,
    });
  } catch (error) {
    console.log(error);
    res.status(500).send("Error creating event");
  }
});

app.put("/update-event/:eventId", async (req, res) => {
  try {
    const { eventId } = req.params;

    const {
      title,
      description,
      date,
      time,
      venue,
      department,
      category,
      capacity,
    } = req.body;

    const updatedEvent = await Event.findByIdAndUpdate(
      eventId,
      {
        title,
        description,
        date,
        time,
        venue,
        department,
        category,
        capacity,
      },
      { new: true },
    );

    res.json({
      message: "Event updated successfully",
      event: updatedEvent,
    });
  } catch (error) {
    console.log(error);
    res.status(500).send("Error updating event");
  }
});

app.get("/events", async (req, res) => {
  try {
    const events = await Event.find();

    const today = new Date();

    const updatedEvents = events.map((event) => {
      const eventDate = new Date(event.date);

      if (eventDate > today) {
        event.status = "upcoming";
      } else if (eventDate.toDateString() === today.toDateString()) {
        event.status = "ongoing";
      } else {
        event.status = "completed";
      }

      return event;
    });

    res.json(updatedEvents);
  } catch (error) {
    console.log(error);
    res.send("Error fetching events");
  }
});
app.post("/register-event", async (req, res) => {
  try {
    const { studentId, eventId } = req.body;
    const event = await Event.findById(eventId);

    if (event.registered >= event.capacity) {
      return res.status(400).json({
        message: "Event is full. Registration closed.",
      });
    }

    const existingRegistration = await Registration.findOne({
      studentId,
      eventId,
    });

    if (existingRegistration) {
      return res.status(400).json({
        message: "Student already registered for this event",
      });
    }

    const registration = new Registration({
      studentId,
      eventId,
    });

    await registration.save();

    const qrData = registration._id.toString();

    const qrImage = await QRCode.toDataURL(qrData);

    registration.qrCode = qrImage;
    await registration.save();

    await Event.findByIdAndUpdate(eventId, {
      $inc: { registered: 1 },
    });

    const student = await User.findById(studentId);

    await transporter.sendMail({
      from: "CampusPulse <campuspulse979@gmail.com>",
      to: student.email,
      subject: "CampusPulse — Event Registration Confirmation",

      text: `
Dear ${student.name},

You have successfully registered for the event:

Event: ${event.title}
Date: ${event.date}
Time: ${event.time}
Venue: ${event.venue}

Login Credentials:
Login ID: ${student.email}
Password: ${student.password}

Login here:
http://127.0.0.1:5500/index.html

Please present your QR code at the event for attendance verification.

Best regards,
CampusPulse Event Management Team
  `,

      html: `
<h2>CampusPulse Event Registration Confirmation</h2>

<p>Dear <b>${student.name}</b>,</p>

<p>You have successfully registered for the following event:</p>

<p>
<b>Event:</b> ${event.title}<br>
<b>Date:</b> ${event.date}<br>
<b>Time:</b> ${event.time}<br>
<b>Venue:</b> ${event.venue}
</p>

<p>Your temporary login credentials are:</p>

<p>
<b>Login ID:</b> ${student.email}<br>
<b>Password:</b> ${student.password}
</p>

<p>
<a href="http://127.0.0.1:5500/index.html">
Click here to login to CampusPulse
</a>
</p>

<p>Please present the QR code below during the event for attendance verification.</p>

<img src="cid:qrimage" width="200"/>

<p>
Best regards,<br>
CampusPulse Event Management Team
</p>
  `,

      attachments: [
        {
          filename: "event-qr.png",
          content: qrImage.split("base64,")[1],
          encoding: "base64",
          cid: "qrimage",
        },
      ],
    });

    res.json({
      message: "Student registered successfully",
      qrCode: qrImage,
      registrationId: registration._id,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      message: "Error registering student",
    });
  }
});

app.get("/attendance-analytics", async (req, res) => {
  try {
    const events = await Event.find();
    const analytics = [];

    for (const event of events) {
      const totalRegistered = await Registration.countDocuments({
        eventId: event._id,
      });

      const totalAttended = await Registration.countDocuments({
        eventId: event._id,
        attended: true,
      });

      analytics.push({
        eventTitle: event.title,
        registered: totalRegistered,
        attended: totalAttended,
      });
    }

    res.json(analytics);
  } catch (error) {
    console.log(error);
    res.status(500).send("Error generating attendance analytics");
  }
});

app.get("/participation-trend", async (req, res) => {
  try {
    const registrations = await Registration.find();

    const monthlyData = {};

    registrations.forEach((reg) => {
      const date = new Date(reg._id.getTimestamp());
      const month = date.toLocaleString("default", { month: "short" });

      if (!monthlyData[month]) {
        monthlyData[month] = 0;
      }

      monthlyData[month]++;
    });

    const result = Object.keys(monthlyData).map((m) => ({
      month: m,
      participants: monthlyData[m],
    }));

    res.json(result);
  } catch (error) {
    console.log(error);
    res.status(500).send("Error generating participation trend");
  }
});

app.get("/department-activity", async (req, res) => {
  try {
    const registrations = await Registration.find().populate("studentId");

    const deptCount = {};

    registrations.forEach((reg) => {
      const dept = reg.studentId.department || "Unknown";

      if (!deptCount[dept]) {
        deptCount[dept] = 0;
      }

      deptCount[dept]++;
    });

    const result = Object.keys(deptCount).map((dept) => ({
      department: dept,
      count: deptCount[dept],
    }));

    res.json(result);
  } catch (error) {
    console.log(error);
    res.status(500).send("Error generating department analytics");
  }
});

app.get("/generate-certificate/:registrationId", async (req, res) => {
  try {
    const registrationId = req.params.registrationId;

    const registration = await Registration.findById(registrationId);

    if (!registration) {
      return res.status(404).json({ message: "Registration not found" });
    }

    registration.certificateGenerated = true;
    await registration.save();

    const student = await User.findById(registration.studentId);
    const event = await Event.findById(registration.eventId);

    if (!student || !event) {
      return res.status(404).json({ message: "Student or Event not found" });
    }

    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
    });

    const fileName = `certificate-${student.name}.pdf`;
    const filePath = path.join(__dirname, "certificates", fileName);

    doc.pipe(fs.createWriteStream(filePath));

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=${fileName}`);

    doc.pipe(res);

    doc.rect(0, 0, doc.page.width, doc.page.height).fill("#0f172a");

    doc
      .rect(25, 25, doc.page.width - 50, doc.page.height - 50)
      .lineWidth(3)
      .stroke("#a855f7");

    doc.moveDown(1);
    doc.fillColor("#ffffff").fontSize(40).text("Certificate of Participation", {
      align: "center",
    });

    doc.moveDown(0.5);

    doc
      .fontSize(18)
      .fillColor("#cbd5f5")
      .text("This certificate is proudly presented to", {
        align: "center",
      });

    doc.moveDown();

    doc.fontSize(34).fillColor("#a855f7").text(student.name, {
      align: "center",
    });

    doc.moveDown();

    doc
      .fontSize(18)
      .fillColor("#e2e8f0")
      .text("For successfully participating in", {
        align: "center",
      });

    doc.moveDown();

    doc.fontSize(26).fillColor("#ffffff").text(`"${event.title}"`, {
      align: "center",
    });

    doc.moveDown(1);

    doc.fontSize(16).fillColor("#cbd5f5").text(`Event Date: ${event.date}`, {
      align: "center",
    });

    doc.moveDown(1);

    doc.moveDown(1);

    doc
      .fontSize(14)
      .fillColor("#ffffff")
      .text("______________________________", 420, 420, {
        align: "center",
      });

    doc
      .fontSize(12)
      .fillColor("#cbd5f5")
      .text("Event Coordinator Signature", 420, 440, { align: "center" });

    doc.moveDown();

    doc
      .fontSize(12)
      .fillColor("#94a3b8")
      .text("CampusPulse Event Management System", {
        align: "center",
      });

    doc.end();
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
app.get("/registrations/:studentId", async (req, res) => {
  try {
    const { studentId } = req.params;

    const registrations = await Registration.find({ studentId });

    res.json(registrations);
  } catch (error) {
    console.log(error);
    res.send("Error fetching registrations");
  }
});

app.post("/mark-attendance", async (req, res) => {
  try {
    const { registrationId, eventId } = req.body;

    const registration = await Registration.findById(registrationId);

    if (!registration) {
      return res.status(404).send("Invalid QR Code");
    }

    if (registration.eventId.toString() !== eventId) {
      return res.status(400).send("QR belongs to another event");
    }

    if (registration.attended) {
      return res.status(400).send("Attendance already marked");
    }

    registration.attended = true;
    await registration.save();

    const student = await User.findById(registration.studentId);
    const event = await Event.findById(registration.eventId);

    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
    });

    const fileName = `certificate-${student.name}.pdf`;
    const filePath = path.join(__dirname, "certificates", fileName);

    doc.pipe(fs.createWriteStream(filePath));

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=${fileName}`);

    doc.pipe(res);

    doc.rect(0, 0, doc.page.width, doc.page.height).fill("#0f172a");

    doc
      .rect(25, 25, doc.page.width - 50, doc.page.height - 50)
      .lineWidth(3)
      .stroke("#a855f7");

    doc.moveDown(1);
    doc.fillColor("#ffffff").fontSize(40).text("Certificate of Participation", {
      align: "center",
    });

    doc.moveDown(0.5);

    doc
      .fontSize(18)
      .fillColor("#cbd5f5")
      .text("This certificate is proudly presented to", {
        align: "center",
      });

    doc.moveDown();

    doc.fontSize(34).fillColor("#a855f7").text(student.name, {
      align: "center",
    });

    doc.moveDown();

    doc
      .fontSize(18)
      .fillColor("#e2e8f0")
      .text("For successfully participating in", {
        align: "center",
      });

    doc.moveDown();

    doc.fontSize(26).fillColor("#ffffff").text(`"${event.title}"`, {
      align: "center",
    });

    doc.moveDown(1);

    doc.fontSize(16).fillColor("#cbd5f5").text(`Event Date: ${event.date}`, {
      align: "center",
    });

    doc.moveDown(1);

    doc.moveDown(1);

    doc
      .fontSize(14)
      .fillColor("#ffffff")
      .text("______________________________", 420, 420, {
        align: "center",
      }); 

    doc
      .fontSize(12)
      .fillColor("#cbd5f5")
      .text("Event Coordinator Signature", 420, 440, { align: "center" });

    doc.moveDown();

    doc
      .fontSize(12)
      .fillColor("#94a3b8")
      .text("CampusPulse Event Management System", {
        align: "center",
      });

    doc.end();
    
    await transporter.sendMail({
      from: "CampusPulse <campuspulse979@gmail.com>",
      to: student.email,
      subject: "CampusPulse — Attendance Confirmed",

      text: `
Dear ${student.name},

Your attendance has been successfully recorded.

Event: ${event.title}
Date: ${event.date}
Time: ${event.time}
Venue: ${event.venue}

Your participation certificate is attached.

Thank you for participating.

CampusPulse Event Management Team
      `,

      html: `
<h2>Attendance Confirmation</h2>

<p>Dear <b>${student.name}</b>,</p>

<p>Your attendance has been successfully recorded for the following event:</p>

<p>
<b>Event:</b> ${event.title}<br>
<b>Date:</b> ${event.date}<br>
<b>Time:</b> ${event.time}<br>
<b>Venue:</b> ${event.venue}
</p>

<p>Your participation certificate is attached with this email.</p>

<p>Thank you for participating.</p>

<p>
Best regards,<br>
CampusPulse Event Management Team
</p>
      `,

      attachments: [
        {
          filename: fileName,
          path: filePath,
        },
      ],
    });

    res.send("Attendance marked successfully");
  } catch (error) {
    console.log(error);
    res.send("Error marking attendance");
  }
});

app.get("/dashboard-stats", async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalEvents = await Event.countDocuments();
    const totalRegistrations = await Registration.countDocuments();

    res.json({
      totalUsers,
      totalEvents,
      totalRegistrations,
    });
  } catch (error) {
    console.log(error);
    res.send("Error fetching dashboard stats");
  }
});

app.get("/event-registrations/:eventId", async (req, res) => {
  try {
    const { eventId } = req.params;

    const registrations = await Registration.find({ eventId }).populate(
      "studentId",
      "name email department year",
    );

    res.json(registrations);
  } catch (error) {
    console.log(error);
    res.send("Error fetching event registrations");
  }
});

app.delete("/delete-registration/:id", async (req, res) => {
  try {
    const registration = await Registration.findById(req.params.id);

    if (!registration) {
      return res.status(404).send("Registration not found");
    }

    await Event.findByIdAndUpdate(registration.eventId, {
      $inc: { registered: -1 },
    });

    await Registration.findByIdAndDelete(req.params.id);

    res.send("Registration deleted");
  } catch (error) {
    console.log(error);
    res.status(500).send("Error deleting registration");
  }
});

app.delete("/delete-event/:eventId", async (req, res) => {
  try {
    const { eventId } = req.params;

    await Event.findByIdAndDelete(eventId);

    await Registration.deleteMany({ eventId });

    res.send("Event deleted successfully");
  } catch (error) {
    console.log(error);
    res.status(500).send("Error deleting event");
  }
});

const PORT = 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

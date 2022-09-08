const schedule = require('node-schedule');
const nodemailer = require('nodemailer');


const ScheduledEmails = require('../models/ScheduledEmail')
const UserEmail = require('../models/UsersEmail')
const Emails = require('../models/ScheduledEmail')
const MailAccount = require('../models/MailAccount')
const List = require('../models/List')



const ScheduledEmailsController = async (req, res) => {
    try {

        const token = req.headers['authorization']

        if (token == "null") {
            throw new Error("You don't have the access")
        }
        else {
            const result = await ScheduledEmails.find({ userId: req.params['userId'] }).sort({
                meetingDate: -1,
                startTime: -1
            })

            if (result.length == 0) {
                throw new Error("No scheduled emails are there")
            }
            else {
                res.send({
                    status: "SUCCESS",
                    data: result
                });
            }
        }
    } catch (error) {
        res.send({
            status: "FAILED",
            message: error.message
        });
    }
}

const DeleteMeetingController = async (req, res) => {
    try {
        let userId = req.params['userId']
        await ScheduledEmails.deleteOne({ _id: userId })
        res.send({
            status: "SUCCESS",
            message: "Meeting has been deleted"
        })
    } catch (error) {
        res.send({
            status: "FAILED",
            message: error.message
        })
    }
}


const SendEmailController = async (req, res) => {
    try {

        let { subject, from, to, description, startTime, endTime, date, reminder, userId } = req.body

        // console.log(new Date(`${date}T${startTime.hours}:${startTime.minutes}`).toUTCString());

        let textArray = description.split(/^/gm)

        // ^ - asserts position at start of a line
        // g - modifier: global. All matches (don't return after first match)
        // m - modifier: multi line. Causes ^ and $ to match the begin/end of each line (not only begin/end of string)


        let descriptionPara = "";

        textArray.forEach(description => {
            let res = deleteLast2chars(description);
            let newPara = `<p>${res}</p>`;
            descriptionPara += newPara
        })

        function deleteLast2chars(sentence) {
            return sentence.slice(0, -1);
        }

        // console.log("new Date",new Date());

        const token = req.headers['authorization']

        if (token == "null") {
            throw new Error("You don't have the access")
        }
        else {
            if (startTime.hours > endTime.hours || (startTime.hours === endTime.hours && startTime.minutes > endTime.minutes)) {
                throw new Error("Start time should be less then end time")
            }
            else {

                let emailDate = new Date(`${date}T${startTime.hours}:${startTime.minutes}`)

                if (emailDate < new Date()) {
                    throw new Error("Select date and time should be greater then today's date and time")
                }

                emailDate.setHours(emailDate.getHours() - 5);
                emailDate.setMinutes(emailDate.getMinutes() - 30);

                // console.log("email",emailDate);

                if (reminder === "Before 1 hour") {
                    emailDate.setMinutes(emailDate.getMinutes() + 1);
                }
                if (reminder === "Before 6 hour") {
                    emailDate.setHours(emailDate.getHours() - 6);
                }
                if (reminder === "Before 12 hour") {
                    emailDate.setHours(emailDate.getHours() - 12);
                }
                if (reminder === "Before 1 day") {
                    emailDate.setHours(emailDate.getHours() - 24);
                }


                else {

                    const response = await MailAccount.find({ email: from, userId })

                    let id = response[0].userId
                    let password = response[0].password

                    // console.log(id, password);

                    let emailIds = []

                    const result = await List.find({ listName: to, userId: id })

                    // console.log(result);

                    if (!result.length) {
                        throw new Error("There is no email")
                    }
                    else {
                        let id = result[0]._id;
                        const response = await UserEmail.find({ userId: id })

                        let i = 0;
                        response.forEach(function (response) {
                            emailIds[i] = response.email
                            i++;
                        })
                        // console.log("ye bhi result h",result);
                        if (emailIds.length == 0) {
                            throw new Error(`No email found in ${result[0].listName} List`)
                        }
                        else {


                            const result = MailAccount.find({ userId, email: from })

                            // console.log(result.data);


                            // console.log("object ", emailDate);
                            if (reminder === "Immediately") {

                                let newTransporter = nodemailer.createTransport({
                                    service: 'gmail',
                                    auth: {
                                        user: from,
                                        pass: password
                                    }
                                })

                                const newScheduledEmails = new ScheduledEmails({
                                    userId: userId,
                                    subject: subject,
                                    from: from,
                                    to: emailIds.toString(),
                                    meetingDate: date,
                                    startTime: `${startTime.hours}:${startTime.minutes}`,
                                    endTime: `${endTime.hours}:${endTime.minutes}`,
                                    ScheduleDate: emailDate.toISOString(),
                                    description: description,
                                    sent: true,
                                })
                                await newScheduledEmails.save()


                                const mailOptions = {
                                    from: from,
                                    to: emailIds.toString(),
                                    subject: subject,
                                    html: `${descriptionPara}
                                    <h4>Date: ${date}</h4>
                                    <h4> Time: ${startTime.hours}:${startTime.minutes}-${endTime.hours}:${endTime.minutes}</h4>`
                                };

                                newTransporter.sendMail(mailOptions)

                                const result = await checkEmailEverySecond();
                                console.log("this is result", result);

                                res.send({
                                    status: "SUCCESS",
                                    message: "Email sent"
                                })

                            }
                            else {

                                const newScheduledEmails = new ScheduledEmails({
                                    userId: userId,
                                    subject: subject,
                                    from: from,
                                    to: emailIds.toString(),
                                    meetingDate: date,
                                    startTime: `${startTime.hours}:${startTime.minutes}`,
                                    endTime: `${endTime.hours}:${endTime.minutes}`,
                                    ScheduleDate: emailDate.toISOString(),
                                    description: description,
                                    sent: false,
                                })
                                await newScheduledEmails.save()

                                await checkEmailEverySecond();

                                res.send({
                                    status: "SUCCESS",
                                    message: `Email saved in draft. It will automatically send ${reminder} of the meeting`
                                })
                            }
                        }
                    }
                }
            }
        }
    } catch (error) {
        res.send({
            status: "FAILED",
            message: error.message,
        });
    }
}


async function checkEmailEverySecond() {


    let scheduledEmail = await Emails.find()

    let id = "";

    schedule.scheduleJob('* * * * * *', () => {

        let data = []

        scheduledEmail.forEach(async function (response) {

            data = response.ScheduleDate

            id = response._id

            // console.log(newTransporter);

            // console.log(new Date(data).toISOString().slice(0, -5));
            // console.log(new Date().toISOString().slice(0, -5));
            // console.log("");

            if (new Date(data).toISOString().slice(0, -5) === new Date().toISOString().slice(0, -5) && response.sent === false) {

                console.log(new Date(data).toISOString().slice(0, -5));
                console.log(new Date().toISOString().slice(0, -5));

                let scheduledEmail = await Emails.find({_id: id})

                console.log("scheduledEmail",scheduledEmail);

                const mailOptions = {
                    from: scheduledEmail[0].from,
                    to: scheduledEmail[0].to,
                    subject: response.subject,
                    html: `${scheduledEmail[0].description} 
                    <h4>Date: ${scheduledEmail[0].date}</h4>
                    <h4> Time: ${scheduledEmail[0].startTime}-${scheduledEmail[0].endTime}</h4>`
                };

                console.log(mailOptions);

                console.log("this is id",id);
                const result = await MailAccount.find({ userId: response.userId, email: response.from })

                console.log("accounts", result);

                let id = scheduledEmail[0].userId
                // let password = result[0].password


                let newTransporter = nodemailer.createTransport({
                    service: 'gmail',
                    auth: {
                        user: result[0].email,
                        pass: result[0].password
                    }
                })

                // console.log("newTransporter",newTransporter);

                newTransporter.sendMail(mailOptions)
                await Emails.updateOne({ _id: id }, { sent: true })

                // console.log("sent");
            }
        })
        // console.log("I'll execute every time");
    })
}


module.exports = {
    ScheduledEmailsController,
    DeleteMeetingController,
    SendEmailController
}
import { spawnSync } from "child_process";
import {
    readFileSync,
    writeFileSync,
    appendFileSync,
    rmSync,
    mkdirSync,
} from "fs";
import * as Sentry from "@sentry/node";
import AWS from "aws-sdk";
import express from "express";

// TODO: move this to a .env var
Sentry.init({
    dsn: process.env.SENTRY_DSN || '',
    // We recommend adjusting this value in production, or using tracesSampler
    // for finer control
    tracesSampleRate: 1.0,
});

const s3 = new AWS.S3();


// Constants
const PORT = process.env.PORT;
const HOST = "0.0.0.0";


// App
const app = express();

app.use(express.json());

app.get("/", async (req, res) => {
    res.send("Hello World");
});


app.post("/prepare", async (req, res) => {
    const body = req.body;
    console.log(body);
    const { aws_path, id } = body;
    const prefix = `${aws_path}/${id}`;
    const bucket = process.env.AWS_BUCKET;
    const params = {
        Bucket: bucket,
        Prefix: prefix,
    };
    console.log(params);
    const records = await s3.listObjectsV2(params).promise();

    console.log(records);
    if (!records.Contents || records.Contents.length < 1) {
        console.log("Contents empty");
        console.log(records.Contents);
        return res.json({
            success: false,
        });
    }

    const userTmpPath = `/tmp/${id}`;
    rmSync(userTmpPath, { recursive: true, force: true });
    mkdirSync(userTmpPath);

    let index = 0;
    for (const record of records.Contents) {
        if (!record) {
            console.log("empty record");
            console.log(record);
            continue;
        }

        console.log(record);
        console.log(record.Key);

        if (record.Key.endsWith(".mp3")) {
            console.log("already a mp3");
            console.log(record.Key);
            continue;
        }
        // get the file
        const s3Object = await s3
            .getObject({
                Bucket: bucket,
                Key: record.Key,
            })
            .promise();

        const tempName = record.Key.split("/").reverse()[0];
        // write file to disk
        writeFileSync(`${userTmpPath}/${tempName}`, s3Object.Body);
        // convert to wav!
        console.log(`${userTmpPath}/${tempName}`);
        spawnSync(
            "ffmpeg",
            [
                "-i",
                `${userTmpPath}/${tempName}`,
                "-f",
                "mp3",
                `${userTmpPath}/${index}.mp3`,
            ],
            { stdio: "inherit" }
        );

        appendFileSync(
            `${userTmpPath}/filelist.txt`,
            `file '${userTmpPath}/${index}.mp3'\n`
        );

        console.log(`Removing ${record.Key}`);
        await s3
            .deleteObject({
                Bucket: bucket,
                Key: record.Key,
            })
            .promise();

        index++;
        // delete the temp files
        //unlinkSync(`/tmp/${tempName}`);
    }

    if (index < 1) {
        return res.json({
            success: false,
        });
    }

    console.log(
        readFileSync(`${userTmpPath}/filelist.txt`, { encoding: "utf-8" })
    );
    const result = spawnSync(
        "ffmpeg",
        [
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            `${userTmpPath}/filelist.txt`,
            "-c",
            "copy",
            `${userTmpPath}/output.mp3`,
        ],
        { stdio: "inherit" }
    );

    console.log(result);
    const wavFile = readFileSync(`${userTmpPath}/output.mp3`);
    // upload wav to s3
    console.log(`Uploading file to S3`);
    await s3
        .putObject({
            Bucket: bucket,
            Key: `${prefix}/output.mp3`,
            Body: wavFile,
        })
        .promise();

    console.log(`Sending response ${prefix}/output.mp3`);
    return res.json({
        audio: `${prefix}/output.mp3`,
        success: true,
    });
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ success: false });
});

app.listen(PORT, HOST, () => {
    console.log(`Running on http://${HOST}:${PORT}`);
});

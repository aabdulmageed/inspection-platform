import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(helmet());
  // Allow the web app's origin(s) — comma-separated (e.g. localhost + LAN IP).
  const origins = (process.env.WEB_ORIGIN ?? "http://localhost:3000").split(",").map((s) => s.trim());
  app.enableCors({ origin: origins });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // OpenAPI — also the contract source for the Swift/Kotlin clients.
  const config = new DocumentBuilder()
    .setTitle("Inspection Platform API")
    .setDescription("Multi-discipline property inspection management (MVP)")
    .setVersion("0.1.0")
    .build();
  const doc = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("docs", app, doc);

  const port = process.env.API_PORT ?? 4000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`API on http://localhost:${port}  (docs at /docs)`);
}
bootstrap();

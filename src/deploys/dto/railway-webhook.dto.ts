import { IsOptional, IsString } from 'class-validator';

export class RailwayWebhookDetailsDto {
  @IsOptional() @IsString() id?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() branch?: string;
  @IsOptional() @IsString() commitHash?: string;
  @IsOptional() @IsString() commitAuthor?: string;
  @IsOptional() @IsString() commitMessage?: string;
}

export class RailwayResourceItemDto {
  @IsOptional() @IsString() id?: string;
  @IsOptional() @IsString() name?: string;
}

export class RailwayWebhookResourceDto {
  @IsOptional() project?: RailwayResourceItemDto;
  @IsOptional() environment?: RailwayResourceItemDto;
  @IsOptional() service?: RailwayResourceItemDto;
  @IsOptional() deployment?: RailwayResourceItemDto;
}

export class RailwayWebhookDto {
  @IsOptional() @IsString() type?: string;
  @IsOptional() details?: RailwayWebhookDetailsDto;
  @IsOptional() resource?: RailwayWebhookResourceDto;
}

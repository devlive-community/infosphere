package org.devlive.infosphere.service.body;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.ToString;
import org.springframework.web.multipart.MultipartFile;

@Data
@Builder
@ToString
@NoArgsConstructor
@AllArgsConstructor
public class UploadBody
{
    private Long id;
    private String code;
    private String mode;
    private MultipartFile file;
}

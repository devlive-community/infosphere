package org.devlive.infosphere.service.entity;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonIncludeProperties;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.ToString;
import org.devlive.infosphere.service.common.FollowType;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import javax.persistence.Column;
import javax.persistence.Entity;
import javax.persistence.EntityListeners;
import javax.persistence.EnumType;
import javax.persistence.Enumerated;
import javax.persistence.FetchType;
import javax.persistence.GeneratedValue;
import javax.persistence.GenerationType;
import javax.persistence.Id;
import javax.persistence.JoinColumn;
import javax.persistence.JoinTable;
import javax.persistence.ManyToOne;
import javax.persistence.Table;

import java.time.Instant;

@Data
@ToString
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "infosphere_follow")
@EntityListeners(AuditingEntityListener.class)
public class FollowEntity
{
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "follow_identify")
    private String identify;

    @Column(name = "type")
    @Enumerated(EnumType.STRING)
    private FollowType type = FollowType.BOOK;

    @Column(name = "create_time")
    @CreatedDate
    @JsonFormat(shape = JsonFormat.Shape.STRING, pattern = "yyyy-MM-dd HH:mm:ss", timezone = "GMT+8")
    private Instant createTime;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinTable(name = "infosphere_follow_fc_relation",
            joinColumns = @JoinColumn(name = "follow_id"),
            inverseJoinColumns = @JoinColumn(name = "user_id"))
    @JsonIncludeProperties(value = {"id", "aliasName", "avatar", "email", "username"})
    private UserEntity user;
}
